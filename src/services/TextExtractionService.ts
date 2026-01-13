import { PDFParse } from 'pdf-parse';
import { marked } from 'marked';
import { logger } from '../utils/logger.ts';

/**
 * Text Extraction Service
 * Extract text from various formats (PDF, Markdown, TXT)
 */
export class TextExtractionService {
  async extractText(buffer: Buffer, mimeType: string): Promise<string> {
    try {
      switch (mimeType) {
        case 'application/pdf':
          return await this.#extractFromPDF(buffer);
        case 'text/markdown':
          return await this.#extractFromMarkdown(buffer);
        case 'text/plain':
          return await this.#extractFromText(buffer);
        default:
          throw new Error(`Unsupported file type: ${mimeType}`);
      }
    } catch (err) {
      logger.error('Error extracting text: ', err);
      throw new Error(
        `Failed to extract text: ${err instanceof Error ? err.message : 'Unknown error!'}`
      );
    }
  }

  /* Extract text from PDF */
  async #extractFromPDF(buffer: Buffer): Promise<string> {
    try {
      const parser = new PDFParse({ data: buffer });
      const parsedText = await parser.getText();
      return parsedText.text;
    } catch (err) {
      logger.error('Error parsing PDF!', err);
      throw new Error('Failed to parse PDF file!');
    }
  }

  /* Extract text from Markdown (convert to plain text)*/
  async #extractFromMarkdown(buffer: Buffer): Promise<string> {
    try {
      const markdown = buffer.toString('utf-8');

      /* Convert markdown to HTML then extract text */
      const html = await marked.parse(markdown);

      /* Simple HTML tag removal */
      return html
        .replace(/<[^>]*>/g, '')
        .replace(/\n\s*\n/g, '\n')
        .trim();
    } catch (err) {
      logger.error('Error parsing Markdown: ', err);
      throw new Error('Failed to parse Markdown file!');
    }
  }

  /* Extract text from plain text file */
  async #extractFromText(buffer: Buffer): Promise<string> {
    return buffer.toString('utf-8');
  }

  /* Chunk text into smaller pieces for embedding */
  chunkText(text: string, chunkSize: number = 1000, overlap: number = 200): string[] {
    if (text.length <= chunkSize) {
      return [text];
    }

    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      let chunk = text.slice(start, end);

      /* Try to end at sentence boundary */
      if (end < text.length) {
        const lastPeriod = chunk.lastIndexOf('.');
        const lastNewLine = chunk.lastIndexOf('\n');
        const boundary = Math.max(lastPeriod, lastNewLine);

        if (boundary > chunkSize * 0.5) {
          chunk = text.slice(start, start + boundary + 1);
          start = start + boundary + 1 - overlap;
        } else {
          start = end - overlap;
        }
      } else {
        start = end;
      }

      chunks.push(chunk.trim());
    }

    return chunks.filter((chunk) => chunk.length > 0);
  }
}

/* Singleton instance */
export const textExtractionService = new TextExtractionService();
