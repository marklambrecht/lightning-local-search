import { requestUrl } from "obsidian";
import type { ClaudeResponse } from "../types";

const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";

export class ClaudeClient {
	constructor(
		private apiKey: string,
		private model: string,
	) {}

	async sendMessage(prompt: string, requestId: string): Promise<ClaudeResponse> {
		const response = await requestUrl({
			url: CLAUDE_API_URL,
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": this.apiKey,
				"anthropic-version": "2023-06-01",
			},
			body: JSON.stringify({
				model: this.model,
				max_tokens: 1024,
				messages: [
					{
						role: "user",
						content: prompt,
					},
				],
			}),
		});

		if (response.status !== 200) {
			throw new Error(
				`Claude API error: ${response.status}`,
			);
		}

		const data = response.json as {
			content?: Array<{ type: string; text?: string }>;
			usage?: { output_tokens?: number };
		};

		const textBlock = data.content?.find(
			(block) => block.type === "text",
		);

		return {
			requestId,
			timestamp: Date.now(),
			summary: textBlock?.text ?? "No response generated",
			tokensUsed: data.usage?.output_tokens ?? 0,
			consentGiven: true,
		};
	}
}
