import { getLlama } from "node-llama-cpp";

async function main() {
    const llama = await getLlama();
    console.log("Llama keys:", Object.keys(llama));
    console.log("Llama prototype keys:", Object.getOwnPropertyNames(Object.getPrototypeOf(llama)));

    // Check if there are any specific methods on Llama instance
    console.log("Llama instance:", llama);

    try {
        const model = await llama.loadModel({ modelPath: "placeholder" });
        console.log("Model keys:", Object.keys(model));
    } catch (e) {
        // Expected to fail, just checking static props if any
    }

    // Import the module directly to see exports
    const module = await import("node-llama-cpp");
    console.log("Module exports:", Object.keys(module));
}

main();
