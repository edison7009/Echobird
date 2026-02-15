
async function testJsonMode() {
    const response = await fetch('http://localhost:11434/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            messages: [
                { role: "system", content: "You are a helpful assistant that outputs JSON." },
                { role: "user", content: "List 3 colors and their hex codes in a JSON object with a 'colors' key." }
            ],
            response_format: { type: "json_object" },
            stream: false
        })
    });

    const data = await response.json();
    console.log("Response status:", response.status);
    console.log("Response body:", JSON.stringify(data, null, 2));

    if (data.choices && data.choices[0].message.content) {
        try {
            const parsed = JSON.parse(data.choices[0].message.content);
            console.log("Parsed content:", parsed);
            console.log("JSON Mode Validation: SUCCESS");
        } catch (e) {
            console.error("JSON Mode Validation: FAILED - Content is not valid JSON");
        }
    } else {
        console.error("JSON Mode Validation: FAILED - No content returned");
    }
}

testJsonMode();
