import { getLlama } from "node-llama-cpp";

console.log("Attempting to load Llama with 'lastBuild' options (expecting CUDA)...");

try {
    const llama = await getLlama("lastBuild");
    console.log("Llama instance loaded.");

    try {
        const gpuInfo = await llama.getGpuVramInfo();
        console.log("GPU Info:", JSON.stringify(gpuInfo, null, 2));
    } catch (e) {
        console.log("Could not get GPU VRAM info (might be normal if no model loaded):", e.message);
    }

    console.log("Verification finished without crashing.");
} catch (error) {
    console.error("Failed to load Llama:", error);
    process.exit(1);
}
