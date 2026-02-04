/**
 * Parser Interfaces
 * 
 * Base interfaces for all resource parsers
 */

export interface ParserOptions {
  // Base options for all parsers
}

export interface ParserResult<T = any> {
  data: T;
  metadata?: Record<string, any>;
}

export interface ResourceParser<T = any> {
  parse(content: string, options?: ParserOptions): Promise<ParserResult<T>>;
}

// USFM Parser
export interface USFMParserOptions extends ParserOptions {
  bookCode?: string;
  bookName?: string;
}

export interface USFMParser extends ResourceParser {
  parse(content: string, options?: USFMParserOptions): Promise<ParserResult>;
}

// TSV Parser
export interface TSVParserOptions extends ParserOptions {
  bookCode?: string;
  bookName?: string;
}

export interface TSVParser extends ResourceParser {
  parse(content: string, options?: TSVParserOptions): Promise<ParserResult>;
}

// Markdown Parser
export interface MarkdownParserOptions extends ParserOptions {
  sanitize?: boolean;
}

export interface MarkdownParser extends ResourceParser {
  parse(content: string, options?: MarkdownParserOptions): Promise<ParserResult>;
}

// JSON Parser
export interface JSONParserOptions extends ParserOptions {
  validate?: boolean;
}

export interface JSONParser extends ResourceParser {
  parse(content: string, options?: JSONParserOptions): Promise<ParserResult>;
}


