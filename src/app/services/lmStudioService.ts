import axios, { AxiosError } from 'axios';

// Interfaces for API responses
export interface LMStudioChoice {
  text?: string; // From completions
  message?: { content: string }; // From chat/completions
  index: number;
  finish_reason: string;
}

export interface LMStudioResponse {
  choices: LMStudioChoice[];
  model?: string; // Model name might be in the response
  [key: string]: any;
}

export interface LMStudioModelInfo {
  id: string;
  object: string;
  created: number;
  [key: string]: any;
}

export interface LMStudioModelsResponse {
  object: string;
  models: LMStudioModelInfo[];
}

// Interface for connection status
export interface ConnectionStatus {
  connected: boolean;
  modelId: string | null;
  error?: string;
}

/**
 * Checks the connection to the LM Studio server using multiple endpoints.
 * @param lmStudioUrl The base URL of the LM Studio server.
 * @returns A promise resolving to the connection status.
 */
export async function checkLMStudioConnection(lmStudioUrl: string): Promise<ConnectionStatus> {
  console.log('Checking LM Studio connection via service at:', lmStudioUrl);

  // 1. Try /models endpoint (newer LM Studio versions)
  try {
    const modelsResponse = await axios.get<LMStudioModelsResponse>(`${lmStudioUrl}/models`, { timeout: 5000 });
    console.log('LM Studio models response:', modelsResponse.data);
    if (modelsResponse.data?.models?.length > 0) {
      const activeModel = modelsResponse.data.models[0]; // Assume first is active
      console.log('Active model found via /models:', activeModel);
      return { connected: true, modelId: activeModel.id || 'Unknown' };
    }
  } catch (error) {
    console.log('Error fetching /models, trying other methods:', error instanceof Error ? error.message : error);
  }

  // 2. Try /chat/completions endpoint (newer API format)
  try {
    console.log('Trying chat completions endpoint...');
    const chatResponse = await axios.post<LMStudioResponse>(`${lmStudioUrl}/chat/completions`, {
      model: "default", // Use default model for check
      messages: [{ role: "user", content: "Say hello" }],
      max_tokens: 5,
      stream: false
    }, { timeout: 5000 });
    console.log('Chat completions response:', chatResponse.data);
    if (chatResponse.data) {
      const modelName = chatResponse.data.model || 'Unknown model';
      console.log('Connection confirmed via chat/completions. Model:', modelName);
      return { connected: true, modelId: modelName };
    }
  } catch (error) {
    console.log('Error with chat completions, trying /completions:', error instanceof Error ? error.message : error);
  }

  // 3. Try /completions endpoint (older API format)
  try {
    console.log('Trying completions endpoint...');
    const completionResponse = await axios.post<LMStudioResponse>(`${lmStudioUrl}/completions`, {
      model: "default", // Use default model for check
      prompt: "Say hello",
      max_tokens: 5,
      stream: false
    }, { timeout: 5000 });
    console.log('Completions response:', completionResponse.data);
    if (completionResponse.data) {
      const modelName = completionResponse.data.model || 'Unknown model';
      console.log('Connection confirmed via /completions. Model:', modelName);
      return { connected: true, modelId: modelName };
    }
  } catch (error) {
    console.log('Error with completions endpoint:', error instanceof Error ? error.message : error);
  }

  // 4. If all checks fail
  console.log('Failed to connect to LM Studio after trying all methods.');
  return { connected: false, modelId: null, error: 'Failed to connect after trying multiple endpoints.' };
}

/**
 * Fetches a raw move suggestion from LM Studio, trying different endpoints.
 * @param lmStudioUrl The base URL of the LM Studio server.
 * @param prompt The detailed prompt for the AI.
 * @param modelId The ID of the model to use (or null/default).
 * @returns A promise resolving to the raw text response from the AI.
 * @throws Throws an error if communication fails after trying endpoints.
 */
export async function fetchRawAIMove(
  lmStudioUrl: string,
  prompt: string,
  modelId: string | null
): Promise<string> {
  const modelToUse = modelId || "default";
  console.log(`Fetching AI move using model: ${modelToUse}`);

  // 1. Try /chat/completions endpoint first (recommended)
  try {
    console.log('Trying chat/completions endpoint for move...');
    const response = await axios.post<LMStudioResponse>(`${lmStudioUrl}/chat/completions`, {
      model: modelToUse,
      messages: [
        {
          role: "system",
          content: "You are a chess engine. You will analyze the board position and make the best move possible based on chess principles. Respond with only a valid chess move in standard algebraic notation. Do not include any explanations or additional text."
        },
        {
          role: "user",
          content: prompt // Use the detailed prompt passed in
        }
      ],
      temperature: 0.5, // Increased temperature slightly
      max_tokens: 20, // Increased max_tokens slightly
      stream: false,
      stop: ["\n", ".", ",", " ", ":", ";"], // Keep stop sequences
      top_p: 0.95,
      frequency_penalty: 1.0,
      presence_penalty: 1.0
    }, { timeout: 15000 }); // Longer timeout for move generation

    console.log('LM Studio chat/completions response:', JSON.stringify(response.data, null, 2)); // Log full structure
    // More robust check for chat response content
    const chatChoice = response.data?.choices?.[0];
    if (chatChoice?.message?.content) {
      console.log('Extracted move from chatChoice.message.content');
      return chatChoice.message.content.trim();
    }
    // Removed incorrect alternative checks that caused 'never' type errors
    console.log('Could not find valid content in chat/completions response choices.');
  } catch (error) {
    console.error('Error with chat/completions endpoint:', error instanceof Error ? error.message : error);
    if (axios.isAxiosError(error) && error.response) {
      console.error('LM Studio Error Response:', error.response.data);
    }
    // Don't throw yet, try the fallback endpoint
  }

  // 2. Try /completions endpoint as fallback
  try {
    console.log('Trying completions endpoint for move as fallback...');
    const response = await axios.post<LMStudioResponse>(`${lmStudioUrl}/completions`, {
      model: modelToUse,
      prompt, // Use the detailed prompt passed in
      temperature: 0.5, // Increased temperature slightly
      max_tokens: 20, // Increased max_tokens slightly
      stream: false,
      stop: ["\n", ".", ",", " ", ":", ";"], // Keep stop sequences
      top_p: 0.95,
      frequency_penalty: 1.0,
      presence_penalty: 1.0
    }, { timeout: 15000 }); // Longer timeout for move generation

    console.log('LM Studio completions response:', JSON.stringify(response.data, null, 2)); // Log full structure
    // More robust check for completion response text
    const completionChoice = response.data?.choices?.[0];
    if (completionChoice?.text) {
      console.log('Extracted move from completionChoice.text');
      return completionChoice.text.trim();
    }
    // Removed incorrect alternative check that caused 'never' type error
    console.log('Could not find valid text in completions response choices.');
    throw new Error('Received empty or invalid response from /completions endpoint.');
  } catch (error) {
    console.error('Error with completions endpoint:', error instanceof Error ? error.message : error);
    if (axios.isAxiosError(error) && error.response) {
      console.error('LM Studio Error Response:', error.response.data);
    }
    // Throw error if both endpoints failed
    throw new Error(`Failed to get AI move from LM Studio after trying both endpoints. Last error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Deprecated or remove the old getAIChessMove function if no longer needed
/*
export async function getAIChessMove(
  fen: string,
  lmStudioUrl: string
): Promise<string> {
  // ... (old implementation)
}
*/
