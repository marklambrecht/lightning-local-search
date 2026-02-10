import { checkEmbeddingCapabilities } from "./platform-guard";

export class EmbeddingService {
	private pipeline: ((
		texts: string | string[],
		options?: { pooling: string; normalize: boolean },
	) => Promise<{ tolist: () => number[][] }>) | null = null;
	private isLoading = false;
	private capabilities = checkEmbeddingCapabilities();

	get isAvailable(): boolean {
		return this.capabilities.canRunEmbeddings;
	}

	get isReady(): boolean {
		return this.pipeline !== null;
	}

	async initialize(
		modelName: string,
		onProgress?: (progress: number) => void,
	): Promise<void> {
		if (!this.isAvailable || this.isLoading || this.isReady) return;
		this.isLoading = true;

		try {
			// Dynamic import to avoid bundling on mobile
			const { pipeline, env } = await import(
				/* webpackIgnore: true */
				"@huggingface/transformers"
			);

			env.allowLocalModels = true;
			env.allowRemoteModels = true;

			const pipe = await pipeline("feature-extraction", modelName, {
				dtype: "q8",
				progress_callback: onProgress
					? (data: Record<string, unknown>) => {
							if (typeof data["progress"] === "number") {
								onProgress(data["progress"]);
							}
						}
					: undefined,
			});

			this.pipeline = pipe as unknown as typeof this.pipeline;
		} finally {
			this.isLoading = false;
		}
	}

	async embed(text: string): Promise<number[]> {
		if (!this.pipeline) {
			throw new Error("Embedding pipeline not initialized");
		}

		const output = await this.pipeline(text, {
			pooling: "mean",
			normalize: true,
		});

		const vectors = output.tolist();
		const first = vectors[0];
		if (!first) {
			throw new Error("Embedding returned empty result");
		}
		return first;
	}

	dispose(): void {
		this.pipeline = null;
	}
}
