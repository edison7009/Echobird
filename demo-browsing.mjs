
import fs from 'fs';

// Configuration
const SERVER_URL = 'http://localhost:11434/v1/chat/completions';
const MODEL_NAME = 'local-model'; // The server will use loaded model regardless of name

// Tool Definitions
const products_tools = [
    {
        type: "function",
        function: {
            name: "read_url",
            description: "Read the textual content of a webpage URL.",
            parameters: {
                type: "object",
                properties: {
                    url: { type: "string", description: "The message to read." }
                },
                required: ["url"]
            }
        }
    }
];

// Mocking the "Browser" - In a real app, use Puppeteer or fetch
async function readUrl(url) {
    console.log(`[Client] Visiting URL: ${url}`);
    // For demo purposes, we return static content or try a simple fetch
    try {
        const res = await fetch(url);
        const text = await res.text();
        return text.substring(0, 2000) + "... (truncated)"; // Limit context
    } catch (e) {
        return `Error reading URL: ${e.message}`;
    }
}

async function chat(messages) {
    console.log(`[Client] Sending request to model...`);
    const response = await fetch(SERVER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: MODEL_NAME,
            messages: messages,
            tools: products_tools,
            tool_choice: "auto"
        })
    });

    const data = await response.json();
    return data.choices[0].message;
}

async function main() {
    let messages = [
        { role: "system", content: "You are a helpful assistant. If you need to read a website, use the read_url tool." },
        { role: "user", content: "Can you read http://example.com and tell me what it says?" }
    ];

    // First Turn: User asks
    const responseMsg = await chat(messages);
    messages.push(responseMsg);

    // Check for Tool Call
    if (responseMsg.tool_calls) {
        console.log(`[Client] Model wants to call tool:`, responseMsg.tool_calls[0].function.name);

        for (const toolCall of responseMsg.tool_calls) {
            if (toolCall.function.name === 'read_url') {
                const args = JSON.parse(toolCall.function.arguments);
                const content = await readUrl(args.url);

                // Add Tool Output to history
                messages.push({
                    role: "tool",
                    tool_call_id: toolCall.id,
                    name: toolCall.function.name,
                    content: content
                });
            }
        }

        // Second Turn: Model generates answer based on tool output
        const finalResponse = await chat(messages);
        console.log(`[Client] Final Answer:\n${finalResponse.content}`);
    } else {
        console.log(`[Client] Model responded directly:\n${responseMsg.content}`);
    }
}

main();
