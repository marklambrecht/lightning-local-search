import { Platform } from "obsidian";

export interface PlatformCapabilities {
	canRunEmbeddings: boolean;
	reason?: string;
}

export function checkEmbeddingCapabilities(): PlatformCapabilities {
	if (Platform.isMobile) {
		return {
			canRunEmbeddings: false,
			reason: "Embeddings are not available on mobile devices",
		};
	}

	if (typeof WebAssembly === "undefined") {
		return {
			canRunEmbeddings: false,
			reason: "WebAssembly is not supported in this environment",
		};
	}

	return { canRunEmbeddings: true };
}
