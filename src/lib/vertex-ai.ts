import { VertexAI } from '@google-cloud/vertexai';

export function getVertexAI() {
  const project = process.env.GOOGLE_CLOUD_PROJECT;
  const location = 'us-central1';
  
  if (!project) {
    throw new Error('GOOGLE_CLOUD_PROJECT environment variable is required');
  }

  console.log('🔑 Creating VertexAI instance with project:', project);
  return new VertexAI({ project, location });
}

// Helper to get the generative model
export function getGenerativeModel(modelName: string = 'gemini-1.5-flash') {
  const vertexAI = getVertexAI();
  return vertexAI.preview.getGenerativeModel({
    model: modelName,
    generationConfig: {
      maxOutputTokens: 8192,
      temperature: 0.2,
    },
  });
}

// Helper specifically for image generation
export function getImageGenerationModel() {
  const vertexAI = getVertexAI();
  return vertexAI.preview.getGenerativeModel({
    model: 'gemini-2.0-flash-exp-image-generation',
    generationConfig: {
      maxOutputTokens: 2048,
      temperature: 0.4,
    },
  });
}