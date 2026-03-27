import { App, Modal, Setting } from 'obsidian';

export class ConfirmModal extends Modal {
	constructor(
		app: App,
		private title: string,
		private details: string[],
		private confirmLabel: string,
		private onConfirm: () => void
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h3', { text: this.title });
		for (const line of this.details) {
			contentEl.createEl('p', { text: line });
		}
		new Setting(contentEl)
			.addButton(btn => btn
				.setButtonText('Cancel')
				.onClick(() => this.close()))
			.addButton(btn => btn
				.setButtonText(this.confirmLabel)
				.setCta()
				.onClick(() => { this.close(); this.onConfirm(); }));
	}

	onClose() {
		this.contentEl.empty();
	}
}
