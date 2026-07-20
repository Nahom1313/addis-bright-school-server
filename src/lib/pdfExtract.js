import pdfParse from 'pdf-parse';

const MAX_CHARS = 6000;

// Downloads a PDF from its Cloudinary URL and extracts text from it.
// Returns null (never throws) if extraction fails for any reason — this
// is a nice-to-have for the study helper chat, not something that should
// ever block a resource upload from succeeding.
export const extractPdfText = async (fileUrl) => {
  try {
    const res = await fetch(fileUrl);
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    const parsed = await pdfParse(buffer);
    const text = (parsed.text || '').replace(/\s+/g, ' ').trim();
    return text ? text.slice(0, MAX_CHARS) : null;
  } catch (err) {
    console.warn('[extractPdfText] Failed:', err.message);
    return null;
  }
};
