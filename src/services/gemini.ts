import { GoogleGenAI, Modality, LiveServerMessage, GenerateContentResponse } from "@google/genai";

export interface ModelOutput {
  text?: string;
  imageUrl?: string;
  videoUrl?: string;
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
   * Connects to the Gemini Live API for real-time multimodal interaction.
   * Includes guardrails to prevent hallucinations and maintain professional standards.
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
          voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
        },
        systemInstruction: `You are Prism, a world-class Creative Director. Your current brand voice is: ${brandVoice}. 
        You help users brainstorm marketing campaigns, visual concepts, and video ads. 
        You are inspiring and highly creative. When a user asks for a visual, you should describe it vividly.
        
        GUARDRAILS:
        1. If you are unsure about a specific fact or technical detail, gracefully admit it and ask for more context.
        2. Do not hallucinate capabilities; only offer to help with creative strategy, visual descriptions, and campaign planning.
        3. Maintain a professional yet creative tone at all times.
        4. If a user command is ambiguous, ask for clarification before proceeding.`,
      },
    });
  }
}

export const gemini = new GeminiService();
