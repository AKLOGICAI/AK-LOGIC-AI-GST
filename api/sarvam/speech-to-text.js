// api/sarvam/speech-to-text.js
// Sarvam AI Speech-to-Text (Saaras) serverless gateway.

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
    const { audioBase64, languageCode = 'hi-IN', mimeType = 'audio/wav' } = req.body || {};
    if (!audioBase64) {
      res.status(400).json({ error: 'Missing audioBase64 in request body.' });
      return;
    }

    // Convert base64 to binary buffer
    const buffer = Buffer.from(audioBase64, 'base64');
    const blob = new Blob([buffer], { type: mimeType });

    const formData = new FormData();
    formData.append('file', blob, `voice_recording.${mimeType.includes('mp4') || mimeType.includes('m4a') ? 'm4a' : mimeType.includes('webm') ? 'webm' : 'wav'}`);
    formData.append('model', 'saaras:v1');
    formData.append('language_code', languageCode);

    const sarvamRes = await fetch('https://api.sarvam.ai/speech-to-text', {
      method: 'POST',
      headers: {
        'api-subscription-key': sarvamKey,
      },
      body: formData,
    });

    if (!sarvamRes.ok) {
      const errText = await sarvamRes.text();
      res.status(sarvamRes.status).json({ error: `Sarvam STT failed: ${errText}` });
      return;
    }

    const data = await sarvamRes.json();
    res.status(200).json({
      ok: true,
      transcript: data.transcript || '',
      languageCode: data.language_code || languageCode,
    });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Internal server error processing audio.' });
  }
}
