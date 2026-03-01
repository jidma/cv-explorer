import fs from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import { getLLMProvider } from '../llm';
import type { Message } from '../llm/types';

export async function parseResume(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();
  let text = '';

  if (ext === '.pdf') {
    text = await parsePDF(filePath);
  } else if (ext === '.docx') {
    text = await parseDOCX(filePath);
  } else {
    throw new Error(`Unsupported file format: ${ext}`);
  }

  // If local parsing yields poor results, fall back to LLM vision
  if (text.trim().length < 100) {
    console.log('Local parsing yielded poor results, falling back to LLM vision...');
    text = await parseWithVision(filePath);
  }

  return text;
}

async function parsePDF(filePath: string): Promise<string> {
  const buffer = fs.readFileSync(filePath);
  const data = await pdfParse(buffer);
  return data.text;
}

async function parseDOCX(filePath: string): Promise<string> {
  const result = await mammoth.extractRawText({ path: filePath });
  return result.value;
}

async function parseWithVision(filePath: string): Promise<string> {
  const buffer = fs.readFileSync(filePath);
  const base64 = buffer.toString('base64');
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = ext === '.pdf' ? 'application/pdf' : 'image/png';

  // For PDF, we send as an image (first page). For more robust handling,
  // you'd convert each page to an image first.
  const dataUrl = `data:${mimeType};base64,${base64}`;

  const llm = getLLMProvider();
  const messages: Message[] = [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'Extract all text content from this resume/CV document. Return only the extracted text, preserving the structure as much as possible.',
        },
        {
          type: 'image_url',
          image_url: { url: dataUrl },
        },
      ],
    },
  ];

  const response = await llm.chat(messages, { maxTokens: 4096 });
  return response.content;
}
