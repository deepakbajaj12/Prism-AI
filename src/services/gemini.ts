import { GoogleGenAI, Modality, Type, LiveServerMessage, GenerateContentResponse } from "@google/genai";

export interface ModelOutput {
  text?: string;
  imageUrl?: string;
  videoUrl?: string;
}

export interface StoryChunk {
  type: 'text' | 'image';
  content: string;
}

export class GeminiService {
  private getApiKey() {
    return process.env.API_KEY || process.env.GEMINI_API_KEY || '';
  }

  private getAI() {
    return new GoogleGenAI({ apiKey: this.getApiKey() });
  }

  private async parseResponse(response: GenerateContentResponse): Promise<ModelOutput> {
    const output: ModelOutput = {
      text: response.text,
    };

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        output.imageUrl = `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
      }
    }

    return output;
  }

  /**
   * Generates a high-quality image using Gemini 2.5 Flash Image.
   * Includes error handling and default aspect ratio configuration.
   */
  async generateImage(prompt: string): Promise<string | null> {
    try {
      const ai = this.getAI();
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [{ text: prompt }],
        },
        config: {
          imageConfig: {
            aspectRatio: "16:9",
          }
        },
      });

      const parsed = await this.parseResponse(response);
      return parsed.imageUrl || null;
    } catch (error) {
      console.error("Error generating image:", error);
      return null;
    }
  }

  /**
   * Generates a cinematic video using Veo 3.1.
   * Implements a polling mechanism to wait for the generation operation to complete.
   */
  async generateVideo(prompt: string): Promise<string | null> {
    try {
      const ai = this.getAI();
      let operation = await ai.models.generateVideos({
        model: 'veo-3.1-fast-generate-preview',
        prompt: prompt,
        config: {
          numberOfVideos: 1,
          resolution: '720p',
          aspectRatio: '16:9'
        }
      });

      while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        operation = await ai.operations.getVideosOperation({ operation: operation });
      }

      const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
      if (!downloadLink) return null;

      const response = await fetch(downloadLink, {
        method: 'GET',
        headers: {
          'x-goog-api-key': this.getApiKey(),
        },
      });
      
      const blob = await response.blob();
      return URL.createObjectURL(blob);
    } catch (error) {
      console.error("Error generating video:", error);
      return null;
    }
  }

  /**
   * Generates a structured creative brief using Gemini 3 Flash.
   * Provides a template for marketing campaign details.
   */
  async generateBrief(concept: string): Promise<string | undefined> {
    try {
      const ai = this.getAI();
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Create a professional creative brief for the following concept: "${concept}". 
        Include:
        1. Campaign Name
        2. Target Audience
        3. Key Message
        4. Visual Style
        5. Tone of Voice`,
      });
      return response.text;
    } catch (error) {
      console.error("Error generating brief:", error);
      return undefined;
    }
  }

  /**
   * Generates an interleaved storyboard: text narration + images in ONE streaming response.
   *
   * Uses responseModalities: [TEXT, IMAGE] with gemini-2.0-flash-preview-image-generation.
   * This is the "Creative Storyteller" mandatory requirement — a single model call that
   * weaves together written scene descriptions and generated visuals simultaneously.
   *
   * The generator yields StoryChunk objects as they arrive from the stream so the UI
   * can render each piece the moment Gemini produces it.
   */
  async *generateStoryboard(prompt: string, brandVoice: string): AsyncGenerator<StoryChunk> {
    const ai = this.getAI();

    const systemPrompt = `You are Prism, an award-winning Creative Director with brand voice: "${brandVoice}".

Create a cinematic 3-scene campaign storyboard for: "${prompt}"

For EACH scene you MUST:
1. Write the scene label (e.g. "SCENE 01 — HOOK") as a short header line
2. Write a vivid 2-3 sentence description of the visual and emotional feel
3. Generate ONE image that brings that scene to life (16:9, photorealistic or editorial style)

Then write a brief "CAMPAIGN DIRECTION" paragraph that ties all scenes together.

Write naturally — the text and images should flow together like a professional creative deck.`;

    const response = await ai.models.generateContentStream({
      model: 'gemini-2.0-flash-preview-image-generation',
      contents: [{ role: 'user', parts: [{ text: systemPrompt }] }],
      config: {
        responseModalities: [Modality.TEXT, Modality.IMAGE],
        temperature: 1,
      },
    });

    for await (const chunk of response) {
      const parts = chunk.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        if (part.text) {
          yield { type: 'text', content: part.text };
        } else if (part.inlineData?.data) {
          const mimeType = part.inlineData.mimeType || 'image/png';
          yield { type: 'image', content: `data:${mimeType};base64,${part.inlineData.data}` };
        }
      }
    }
  }

  /**
   * Connects to the Gemini Live API for real-time multimodal interaction.
   *
   * Key upgrades:
   * - Tool calling: Gemini can invoke generate_image / generate_storyboard / generate_brief
   *   directly from voice, creating a true agentic voice-to-creation loop.
   * - Barge-in: the Live API handles interruption natively; the UI listens for
   *   serverContent.interrupted to cancel queued audio immediately.
   */
  connectLive(
    callbacks: {
      onopen?: () => void;
      onmessage: (message: LiveServerMessage) => void;
      onerror?: (error: any) => void;
      onclose?: () => void;
    },
    brandVoice: string = "Professional & Creative"
  ) {
    const ai = this.getAI();
    return ai.live.connect({
      model: "gemini-2.5-flash-native-audio-preview-09-2025",
      callbacks,
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } },
        },
        tools: [
          {
            functionDeclarations: [
              {
                name: "generate_image",
                description: "Generate a campaign image. Call this when the user asks to visualize, create an image, or see a visual concept.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    prompt: {
                      type: Type.STRING,
                      description: "Detailed visual description — include style, mood, lighting, composition.",
                    },
                  },
                  required: ["prompt"],
                },
              },
              {
                name: "generate_storyboard",
                description: "Generate an interleaved campaign storyboard with text and images. Call this when the user asks for a storyboard, campaign deck, or visual narrative.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    concept: {
                      type: Type.STRING,
                      description: "The campaign concept or product idea to storyboard.",
                    },
                  },
                  required: ["concept"],
                },
              },
              {
                name: "generate_brief",
                description: "Generate a professional creative brief. Call this when the user asks for a brief, strategy summary, or campaign direction document.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    concept: {
                      type: Type.STRING,
                      description: "The campaign concept to write a brief for.",
                    },
                  },
                  required: ["concept"],
                },
              },
            ],
          },
        ],
        systemInstruction: `You are Prism, a world-class AI Creative Director. Brand voice: "${brandVoice}".

You help users brainstorm campaigns, generate visuals, and build creative decks through natural voice conversation.

TOOL USE (critical — do not skip):
- When a user asks to "generate", "create", "visualize", "make an image", "show me", or "storyboard" anything — call the appropriate tool immediately. Do NOT just describe it verbally.
- generate_image → single visuals, mood board frames, product shots.
- generate_storyboard → full campaign narratives, scene sequences, creative decks.
- generate_brief → strategy documents, campaign direction summaries.
- After calling a tool, confirm in one brief sentence what you triggered.

CONVERSATION STYLE:
- Inspiring, concise, direct. No filler.
- Ask clarifying questions only when intent is genuinely ambiguous.
- Never fabricate facts — if unsure, say so.
- Always maintain the "${brandVoice}" tone.`,
      },
    });
  }
}

export const gemini = new GeminiService();
