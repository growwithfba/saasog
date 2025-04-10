import runScoringTest from './test-scoring';

// Run the test and output the results
const result = runScoringTest();
console.log('\nTest complete!');
console.log(`The car ramp market scores ${result.score.toFixed(1)}% (${result.status})`); 