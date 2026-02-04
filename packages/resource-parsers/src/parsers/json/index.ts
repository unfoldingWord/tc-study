/**
 * JSON Parser
 */

export class JSONParser {
  async parse(content: string): Promise<any> {
    try {
      return JSON.parse(content);
    } catch (error) {
      throw new Error(`Failed to parse JSON: ${error}`);
    }
  }
}


