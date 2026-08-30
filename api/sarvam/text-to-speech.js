// api/sarvam/text-to-speech.js
// Sarvam AI Text-to-Speech (Bulbul) serverless gateway.

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use POST.' });
    return;
  }

  const sarvamKey = process.env.SARVAM_API_KEY;
  if (!sarvamKey) {
    res.status(500).json({ error: 'SARVAM_API_KEY is not configured on Vercel.' });
    return;
  }

  try {
    const { text, languageCode = 'hi-IN', speaker = 'meera' } = req.body || {};
    if (!text || typeof text !== 'string') {
      res.status(400).json({ error: 'Missing or invalid text field.' });
      return;
    }

    // Clean markdown formatting before TTS reading
    const cleanText = text
      .replace(/[*#_`~>]/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .slice(0, 480);

    const sarvamRes = await fetch('https://api.sarvam.ai/text-to-speech', {
      method: 'POST',
      headers: {
        'api-subscription-key': sarvamKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: [cleanText],
        target_language_code: languageCode,
        speaker: speaker,
        pitch: 0,
        pace: 1.05,
        loudness: 1.5,
        speech_sample_rate: 22050,
        enable_preprocessing: true,
        model: 'bulbul:v1',
      }),
    });

    if (!sarvamRes.ok) {
      const errText = await sarvamRes.text();
      res.status(sarvamRes.status).json({ error: `Sarvam TTS failed: ${errText}` });
      return;
    }

    const data = await sarvamRes.json();
    const audioBase64 = data.audios?.[0] || '';

    res.status(200).json({
      ok: true,
      audioBase64,
      mimeType: 'audio/wav',
    });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Internal server error generating audio.' });
  }
}
