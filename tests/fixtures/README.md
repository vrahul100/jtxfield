# Test Fixtures

This directory contains test media files.

## Audio Files
- `test-audio.mp3` - Sample voice note for testing audio transcription

## Usage
Audio files are served via the dev server at:
```
http://localhost:3000/test-fixtures/test-audio.mp3
```

## Adding Test Audio
1. Send a voice note via WhatsApp
2. Download the audio from Twilio (before it expires)
3. Save to `tests/fixtures/test-audio.mp3`
4. Use in tests: `http://localhost:3000/test-fixtures/test-audio.mp3`
