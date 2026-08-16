import { AutoModelForSequenceClassification, AutoTokenizer } from "@xenova/transformers";

async function test() {
    const MODEL_ID = "Xenova/bge-reranker-base";
    const tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID);
    const model = await AutoModelForSequenceClassification.from_pretrained(MODEL_ID);

    const query = "What is panda?";
    const docs = [
        "hi",
        "The giant panda is a bear species endemic to China."
    ];
    
    const queries = Array(docs.length).fill(query);
    
    // Try passing text and text_pair directly as two arguments
    const inputs1 = await tokenizer(queries, { text_pair: docs, padding: true, truncation: true, return_tensors: 'pt' });
    const output1 = await model(inputs1);
    console.log("Logits 1:", output1.logits.data);
}

test().catch(console.error);
