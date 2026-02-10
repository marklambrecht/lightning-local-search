import { Modal, type App } from "obsidian";
import type { ClaudeRequest } from "../types";

export class ConsentManager {
	constructor(private app: App) {}

	/**
	 * Show the user exactly what data will be sent and get explicit consent.
	 * Returns true if user consents, false if they cancel.
	 */
	requestConsent(request: ClaudeRequest): Promise<boolean> {
		return new Promise((resolve) => {
			const modal = new ConsentModal(this.app, request, resolve);
			modal.open();
		});
	}
}

class ConsentModal extends Modal {
	constructor(
		app: App,
		private request: ClaudeRequest,
		private onDecision: (consented: boolean) => void,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("ai-consent-modal");

		contentEl.createEl("h2", { text: "AI request review" });

		contentEl.createEl("p", {
			text:
				"The following data will be sent to Anthropic's Claude API. " +
				"Review carefully before proceeding.",
		});

		// Query
		const querySection = contentEl.createDiv({ cls: "ai-consent-section" });
		querySection.createEl("h3", { text: "Your query" });
		querySection.createEl("code", { text: this.request.query });

		// Context size
		const contextSection = contentEl.createDiv({
			cls: "ai-consent-section",
		});
		contextSection.createEl("h3", { text: "Context data" });
		contextSection.createEl("p", {
			text:
				`${this.request.contextNoteCount} note excerpt(s), ` +
				`~${this.request.contextTokenEstimate} tokens`,
		});

		// Full prompt (collapsible)
		const promptSection = contentEl.createDiv({
			cls: "ai-consent-section",
		});
		const details = promptSection.createEl("details");
		details.createEl("summary", { text: "View full prompt" });
		const pre = details.createEl("pre", { cls: "ai-consent-prompt" });
		pre.createEl("code", { text: this.request.prompt });

		// Buttons
		const buttonRow = contentEl.createDiv({ cls: "ai-consent-buttons" });

		const cancelBtn = buttonRow.createEl("button", { text: "Cancel" });
		cancelBtn.addEventListener("click", () => {
			this.onDecision(false);
			this.close();
		});

		const sendBtn = buttonRow.createEl("button", {
			text: "Send to Claude",
			cls: "mod-cta",
		});
		sendBtn.addEventListener("click", () => {
			this.onDecision(true);
			this.close();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
