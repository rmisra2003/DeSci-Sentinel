/**
 * evaluator.ts — AI-powered research evaluation engine for DeSci Sentinel.
 *
 * Replaces the keyword-based heuristic scorer with OpenAI GPT-4.1-mini.
 * The LLM performs scientific evaluation (scores + routing + reasoning).
 * Business logic (trustScore, grantRecommendation, verificationHash)
 * remains deterministic and computed server-side.
 *
 * Key design decisions:
 * - Structured Outputs via JSON Schema response_format (never parse free text)
 * - Zod validation on every AI response (never trust model output blindly)
 * - Score clamping to [0, 25] (defense-in-depth)
 * - Retry once on parse/validation failure
 * - Comprehensive observability logging (latency, tokens, model, errors)
 * - EvaluationResult interface unchanged for frontend compatibility
 */

import { createHash, randomBytes } from "crypto";
import OpenAI from "openai";
import { z } from "zod";
import { SCHOLAR_SYSTEM_PROMPT, buildUserPrompt } from "./prompt.js";

// ─── Configuration ──────────────────────────────────────────────────────────

const OPENAI_MODEL = "gpt-4.1-mini";
const OPENAI_FALLBACK_MODEL = "gpt-4o-mini";
const OPENAI_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 1;

// ─── OpenAI Client ──────────────────────────────────────────────────────────

function getOpenAIClient(): OpenAI {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        throw new Error(
            "[AI-Evaluator] OPENAI_API_KEY is not set. " +
            "Add it to your .env file to enable AI-powered evaluation."
        );
    }
    return new OpenAI({ apiKey, timeout: OPENAI_TIMEOUT_MS });
}

// ─── Zod Schema for AI Response Validation ──────────────────────────────────

const AIScoreResponseSchema = z.object({
    novelty: z.number().min(0).max(25),
    methodology: z.number().min(0).max(25),
    impact: z.number().min(0).max(25),
    reproducibility: z.number().min(0).max(25),
    recommendedBioDAO: z.string().min(1),
    impactCategory: z.string().min(1),
    reasoning: z.string().min(1),
    confidence: z.number().min(0).max(1),
});

type AIScoreResponse = z.infer<typeof AIScoreResponseSchema>;

// ─── JSON Schema for OpenAI Structured Outputs ─────────────────────────────

const AI_RESPONSE_JSON_SCHEMA = {
    name: "evaluation_response",
    strict: true,
    schema: {
        type: "object" as const,
        properties: {
            novelty: { type: "number" as const, description: "Novelty score from 0 to 25" },
            methodology: { type: "number" as const, description: "Methodology score from 0 to 25" },
            impact: { type: "number" as const, description: "Scientific impact score from 0 to 25" },
            reproducibility: { type: "number" as const, description: "Reproducibility score from 0 to 25" },
            recommendedBioDAO: { type: "string" as const, description: "Name of the recommended BioDAO" },
            impactCategory: { type: "string" as const, description: "Research impact category" },
            reasoning: { type: "string" as const, description: "2-4 sentence evaluation rationale" },
            confidence: { type: "number" as const, description: "Self-assessed confidence 0.0 to 1.0" },
        },
        required: [
            "novelty", "methodology", "impact", "reproducibility",
            "recommendedBioDAO", "impactCategory", "reasoning", "confidence",
        ],
        additionalProperties: false,
    },
};

// ─── Public Interface (unchanged for backward compatibility) ────────────────

export interface EvaluationResult {
    trustScore: number;
    impactCategory: string;
    agentReasoning: string;
    verificationHash: string;
    reproducibilityScore?: number;
    methodologyScore?: number;
    noveltyScore?: number;
    impactScore?: number;
    recommendedBioDao?: string;
    grantRecommendation?: string;
    payoutTx?: string;
}

// ─── Main Evaluation Function ───────────────────────────────────────────────

/**
 * Evaluate research using OpenAI GPT-4.1-mini with structured outputs.
 * Business logic (trustScore, grantRecommendation, verificationHash)
 * is computed deterministically server-side.
 */
export async function evaluateResearch(
    content: string,
    options: {
        deepResearch?: boolean; // Kept for interface compatibility
    } = {}
): Promise<EvaluationResult> {
    const evaluationId = randomBytes(6).toString("hex");
    const startTime = Date.now();

    console.log(`🧪 [AI-Evaluator] START evaluation_id=${evaluationId}`);

    // Deterministic: content fingerprint (unchanged from original)
    const verificationHash = createHash("sha256")
        .update(content)
        .digest("hex")
        .slice(0, 16);

    try {
        // Call OpenAI with retry logic
        const aiResponse = await callOpenAIWithRetry(content, evaluationId);

        // Clamp scores defensively (never trust model output blindly)
        const noveltyScore = clampScore(aiResponse.novelty, 25);
        const methodologyScore = clampScore(aiResponse.methodology, 25);
        const impactScore = clampScore(aiResponse.impact, 25);
        const reproducibilityScore = clampScore(aiResponse.reproducibility, 25);

        // Deterministic business logic (computed server-side, NOT by the LLM)
        const trustScore = clampScore(
            noveltyScore + methodologyScore + impactScore + reproducibilityScore,
            100
        );
        const grantRecommendation =
            trustScore >= 80 ? "FUND" : trustScore >= 60 ? "REVIEW" : "REJECT";

        const agentReasoning = [
            `AI Evaluation (${OPENAI_MODEL}, confidence: ${aiResponse.confidence.toFixed(2)}).`,
            `Reproducibility: ${reproducibilityScore}/25, Methodology: ${methodologyScore}/25, Novelty: ${noveltyScore}/25, Impact: ${impactScore}/25.`,
            `Recommended BioDAO: ${aiResponse.recommendedBioDAO}.`,
            `Grant Recommendation: ${grantRecommendation}.`,
            aiResponse.reasoning,
        ].join(" ");

        const latency = Date.now() - startTime;
        console.log(
            `🧪 [AI-Evaluator] COMPLETE evaluation_id=${evaluationId} ` +
            `latency=${latency}ms model=${OPENAI_MODEL} trustScore=${trustScore}`
        );

        const evaluation: EvaluationResult = {
            trustScore,
            impactCategory: aiResponse.impactCategory,
            agentReasoning,
            verificationHash,
            reproducibilityScore,
            methodologyScore,
            noveltyScore,
            impactScore,
            recommendedBioDao: aiResponse.recommendedBioDAO,
            grantRecommendation,
        };

        console.log(`📊 [AI-Evaluator] Final Trust Score: ${evaluation.trustScore}/100`);
        console.log(`   Category: ${evaluation.impactCategory}`);
        console.log(`   BioDAO: ${evaluation.recommendedBioDao || "N/A"}`);

        return evaluation;
    } catch (error) {
        const latency = Date.now() - startTime;
        const errorMessage =
            error instanceof Error ? error.message : String(error);

        console.error(
            `🧪 [AI-Evaluator] ERROR evaluation_id=${evaluationId} ` +
            `latency=${latency}ms error="${errorMessage}"`
        );

        throw new Error(`AI evaluation failed: ${errorMessage}`);
    }
}

// ─── OpenAI API Call with Retry ─────────────────────────────────────────────

async function callOpenAIWithRetry(
    content: string,
    evaluationId: string,
): Promise<AIScoreResponse> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (attempt > 0) {
            console.log(
                `🔄 [AI-Evaluator] RETRY evaluation_id=${evaluationId} attempt=${attempt}`
            );
        }

        try {
            return await callOpenAI(content, evaluationId);
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

            // Don't retry on auth or config errors — they won't resolve
            if (isNonRetryableError(lastError)) {
                throw lastError;
            }
        }
    }

    throw new Error(
        `AI evaluation failed after ${MAX_RETRIES + 1} attempts: ${lastError?.message}`
    );
}

// ─── Core OpenAI API Call ───────────────────────────────────────────────────

async function callOpenAI(
    content: string,
    evaluationId: string,
): Promise<AIScoreResponse> {
    const client = getOpenAIClient();
    const userPrompt = buildUserPrompt(content);

    let response: OpenAI.Chat.Completions.ChatCompletion;

    try {
        response = await client.chat.completions.create({
            model: OPENAI_MODEL,
            messages: [
                { role: "system", content: SCHOLAR_SYSTEM_PROMPT },
                { role: "user", content: userPrompt },
            ],
            response_format: {
                type: "json_schema",
                json_schema: AI_RESPONSE_JSON_SCHEMA,
            },
            temperature: 0.3, // Low temperature for consistent, analytical output
        });
    } catch (error) {
        throw categorizeOpenAIError(error);
    }

    // Log token usage for observability
    const usage = response.usage;
    if (usage) {
        console.log(
            `🧪 [AI-Evaluator] TOKENS evaluation_id=${evaluationId} ` +
            `prompt=${usage.prompt_tokens} completion=${usage.completion_tokens} ` +
            `total=${usage.total_tokens}`
        );
    }

    // Extract and parse the response content
    const choice = response.choices[0];
    if (!choice || !choice.message.content) {
        throw new Error("OpenAI returned an empty response");
    }

    // Check if the model refused the request
    if (choice.message.refusal) {
        throw new Error(`OpenAI refused the request: ${choice.message.refusal}`);
    }

    // Parse JSON
    let parsed: unknown;
    try {
        parsed = JSON.parse(choice.message.content);
    } catch {
        throw new Error(
            `Failed to parse AI response as JSON: ${choice.message.content.slice(0, 200)}`
        );
    }

    // Validate with Zod
    const validated = AIScoreResponseSchema.safeParse(parsed);
    if (!validated.success) {
        const issues = validated.error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; ");
        throw new Error(`AI response validation failed: ${issues}`);
    }

    return validated.data;
}

// ─── Error Classification ───────────────────────────────────────────────────

function categorizeOpenAIError(error: unknown): Error {
    if (error instanceof OpenAI.APIError) {
        const status = error.status;
        const message = error.message || "Unknown OpenAI API error";

        if (status === 401) {
            return new Error(`OpenAI authentication failed: ${message}`);
        }
        if (status === 429) {
            return new Error(`OpenAI rate limit exceeded: ${message}. Please retry later.`);
        }
        if (status === 500 || status === 502 || status === 503) {
            return new Error(`OpenAI service unavailable (${status}): ${message}`);
        }
        if (status === 400) {
            return new Error(`OpenAI bad request: ${message}`);
        }

        return new Error(`OpenAI API error (${status}): ${message}`);
    }

    if (error instanceof OpenAI.APIConnectionError) {
        return new Error(`OpenAI connection failed: ${error.message}`);
    }

    if (error instanceof Error && error.message.includes("timeout")) {
        return new Error(`OpenAI request timed out after ${OPENAI_TIMEOUT_MS}ms`);
    }

    return error instanceof Error ? error : new Error(String(error));
}

function isNonRetryableError(error: Error): boolean {
    const msg = error.message.toLowerCase();
    return (
        msg.includes("authentication failed") ||
        msg.includes("api_key") ||
        msg.includes("not set")
    );
}

// ─── Utility ────────────────────────────────────────────────────────────────

function clampScore(score: number, max: number): number {
    if (score < 0) return 0;
    if (score > max) return max;
    return Math.round(score);
}
