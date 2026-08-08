import { AbstractInputSuggest, App } from "obsidian";

/** 轻量文件夹建议：输入时列出 vault 内所有文件夹路径。 */
export class FolderSuggest extends AbstractInputSuggest<string> {
  private readonly input: HTMLInputElement;

  constructor(
    app: App,
    private readonly inputEl: HTMLInputElement,
  ) {
    super(app, inputEl);
    this.input = inputEl;
  }

  getSuggestions(query: string): string[] {
    const folders = (this.app.vault as unknown as { getAllLoadedFiles(): Array<{ path?: string; children?: unknown[] }> })
      .getAllLoadedFiles()
      .filter((f) => Array.isArray(f.children))
      .map((f) => f.path ?? "");
    const q = query.trim().toLowerCase();
    const matched = q ? folders.filter((p) => p.toLowerCase().includes(q)) : folders;
    return matched.slice(0, 30);
  }

  renderSuggestion(value: string, el: HTMLElement): void {
    el.setText(value);
  }

  selectSuggestion(value: string): void {
    const input = this.input;
    input.value = value;
    input.trigger("input");
    this.close();
  }
}
