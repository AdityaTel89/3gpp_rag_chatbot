import fs from 'fs';
import path from 'path';

interface TestQuestion {
  query: string;
  type: string;
  expected_abstain: boolean;
  expected_sources?: string[];
}

interface EvalResult extends TestQuestion {
  actual_abstain: boolean;
  citations: any[];
  answer: string;
  confidence: number;
  retrieval_success?: boolean;
  abstain_success: boolean;
  false_abstain: boolean;
}

const API_URL = process.env.API_URL || 'http://localhost:3000/api/query';
const QUESTIONS_FILE = path.join(__dirname, 'test_questions.json');
const RESULTS_FILE = path.join(__dirname, 'results.json');

async function runEvaluation() {
  const questions: TestQuestion[] = JSON.parse(fs.readFileSync(QUESTIONS_FILE, 'utf-8'));
  const results: EvalResult[] = [];

  console.log(`Starting evaluation for ${questions.length} questions...`);
  console.log(`Ensure that the backend is running at ${API_URL}\n`);

  let correctAbstentions = 0;
  let falseAbstentions = 0;
  let retrievalSuccesses = 0;
  let totalWithExpectedSources = 0;

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    console.log(`[${i + 1}/${questions.length}] Evaluating: "${q.query}" (${q.type})`);

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q.query }),
      });

      if (!response.ok) {
        console.error(`  -> HTTP Error: ${response.status} ${response.statusText}`);
        continue;
      }

      const data = await response.json();
      
      const actual_abstain = data.abstained;
      const citations = data.citations || [];
      const confidence = data.confidence || 0;
      
      const abstain_success = actual_abstain === q.expected_abstain;
      const false_abstain = actual_abstain === true && q.expected_abstain === false;

      let retrieval_success = undefined;
      if (q.expected_sources && q.expected_sources.length > 0) {
        totalWithExpectedSources++;
        // Check if any expected source is in the citations
        const retrievedSpecs = citations.map((c: any) => c.spec);
        retrieval_success = q.expected_sources.some((source) => retrievedSpecs.includes(source));
        if (retrieval_success) retrievalSuccesses++;
      }

      if (abstain_success) correctAbstentions++;
      if (false_abstain) falseAbstentions++;

      console.log(`  -> Abstained: ${actual_abstain} (Expected: ${q.expected_abstain})`);
      if (actual_abstain) {
        console.log(`  -> Confidence: ${confidence.toFixed(2)}`);
      } else {
        console.log(`  -> Citations: ${citations.length}`);
        console.log(`  -> Answer Preview: ${data.answer.substring(0, 60).replace(/\n/g, ' ')}...`);
      }
      console.log('');

      results.push({
        ...q,
        actual_abstain,
        citations,
        answer: data.answer,
        confidence,
        retrieval_success,
        abstain_success,
        false_abstain,
      });

    } catch (error) {
      console.error(`  -> Error executing query:`, error);
    }
  }

  const metrics = {
    total_questions: questions.length,
    abstention_accuracy: `${((correctAbstentions / questions.length) * 100).toFixed(2)}%`,
    false_abstention_rate: `${((falseAbstentions / questions.length) * 100).toFixed(2)}%`,
    retrieval_recall: totalWithExpectedSources > 0 ? `${((retrievalSuccesses / totalWithExpectedSources) * 100).toFixed(2)}%` : 'N/A',
  };

  console.log('========================================');
  console.log('Evaluation Complete');
  console.log('========================================');
  console.table(metrics);

  fs.writeFileSync(RESULTS_FILE, JSON.stringify({ metrics, results }, null, 2));
  console.log(`\nDetailed results saved to ${RESULTS_FILE}`);
}

runEvaluation().catch(console.error);
