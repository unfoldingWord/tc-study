/**
 * Markdown Parser
 */

export class MarkdownParser {
  async parse(content: string): Promise<{ html: string }> {
    // Basic markdown parsing - can be enhanced with 'marked' library
    return {
      html: content
    };
  }
}


