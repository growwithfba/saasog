import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_SECRET_KEY,
});

// 1. ESTRUCTURA DE SALIDA (JSON SCHEMA) - Review Analysis
const JSON_STRUCTURE_INSTRUCTION = `
Output strictly in valid JSON format using the following structure:
{
  "praise_points": [
    { "summary": "...", "quote": "...", "source_star_rating": 5 }
  ],
  "pain_points": [
    { "complaint": "...", "quote": "...", "severity_score": 1, "priority_rank": 1 }
  ],
  "additional_insights": [
    { "pattern": "...", "leverage_strategy": "..." }
  ],
  "unasked_questions": [
    { "question": "...", "reasoning": "..." }
  ]
}
`;

// 2. ESTRUCTURA DE SALIDA (JSON SCHEMA) - SSP Analysis
const SSP_JSON_STRUCTURE = `
Output strictly in valid JSON format using the following structure:
{
  "quantity_improvements": [
    { 
      "recommendation": "...", 
      "justification": "...",
      "customer_insight_source": "..."
    }
  ],
  "functional_enhancements": [
    { 
      "recommendation": "...", 
      "pain_point_addressed": "...",
      "reasoning": "..."
    }
  ],
  "quality_upgrades": [
    { 
      "recommendation": "...", 
      "complaint_addressed": "...",
      "justification": "..."
    }
  ],
  "aesthetic_innovations": [
    { 
      "recommendation": "...", 
      "market_trend_or_preference": "...",
      "reasoning": "..."
    }
  ],
  "strategic_bundling": [
    { 
      "bundle_item": "...", 
      "justification": "...",
      "usage_pattern_insight": "..."
    }
  ]
}
`;

// 2. HELPER: Convierte tu Array de Objetos a un String legible para la IA
// Esto es vital para que la IA sepa qué texto pertenece a qué calificación.
function formatReviewsForPrompt(reviewsArray) {
  return reviewsArray.map((r, index) => {
    return `Review #${index + 1}:
[Rating: ${r.stars} Stars]
Title: "${r.title}"
Content: "${r.comment}"
---`;
  }).join('\n');
}

const SYSTEM_PROMPT = `
Role:
You are an expert Amazon Private Label Product Analyst. 
Your goal is to analyze reviews to find Super Selling Points (SSPs) and critical flaws.
Output strictly in JSON format.
`;

const SSP_SYSTEM_PROMPT = `
Role:
You are an elite Amazon Private Label Product Strategist and Innovation Consultant.
Your mission is to transform customer insights into actionable Superhero Selling Points (SSPs) that will dominate the market.
You must deliver precise, innovative, and customer-centric product improvement recommendations.
Output strictly in JSON format.
`;

// 3. FUNCIÓN PRINCIPAL
async function generateReviewAnalysisJSON(reviewsArray) {
  try {
    console.log(`🔄 Procesando ${reviewsArray.length} reseñas...`);

    // Convertimos el array a string formateado
    const reviewsTextFormatted = formatReviewsForPrompt(reviewsArray);
    console.log(reviewsTextFormatted);

    const completion = await openai.chat.completions.create({
      model: "gpt-4o", 
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: `
🎯 Your Task:
Analyze the provided list of Amazon reviews.
**Crucial:** Pay close attention to the **Star Rating** and **Title**.
- Use Low Star reviews (1-3) to identify critical Pain Points.
- Use High Star reviews (4-5) to identify Praise Points.
- If a high-rated review contains a complaint, treat it as a "hidden opportunity" for improvement.

${JSON_STRUCTURE_INSTRUCTION}

Customer Reviews Data:
"""
${reviewsTextFormatted}
"""
`,
        },
      ],
      temperature: 0.7,
      response_format: { type: "json_object" },
    });

    const jsonResponse = JSON.parse(completion.choices[0].message.content);
    return jsonResponse;

  } catch (error) {
    console.error("❌ Error en análisis:", error);
    throw error;
  }
}

// 5. SSP GENERATION FUNCTION - Uses review analysis context
async function generateSSPRecommendations(reviewAnalysisContext) {
  try {
    console.log(`🚀 Generating Superhero Selling Points (SSPs)...`);

    // Format the context for the prompt
    const contextString = JSON.stringify(reviewAnalysisContext, null, 2);

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: SSP_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: `
🎯 PART 2: ACTIONABLE SUPERHERO SELLING POINTS (SSPs)

Based on the following customer review analysis, formulate clear, practical, and innovative product-improvement recommendations. 
Directly leverage the insights uncovered to create recommendations that will dominate the market.

📊 REVIEW ANALYSIS CONTEXT:
"""
${contextString}
"""

Organize your recommendations into these five SSP categories, providing at least two detailed, actionable ideas per category:

📦 1. QUANTITY IMPROVEMENTS
- Recommend specific pack-size or quantity variations (e.g., single vs. multi-pack, bulk options, family packs, subscription-friendly sizes).
- Clearly justify each suggestion based on customer buying patterns, usage frequency, or stated preferences in the reviews.

⚙️ 2. FUNCTIONAL ENHANCEMENTS
- Suggest highly practical, user-centric improvements to product features, usability, or versatility.
- Propose precise additions or adjustments (e.g., ergonomic changes, easier-to-use mechanisms, size modifications).
- Provide clear reasoning linking each suggestion directly to customer pain points or praise.

🔩 3. QUALITY UPGRADES
- Clearly identify specific material upgrades, improvements to durability, comfort, structural integrity, or product reliability.
- Include concise justification linking quality enhancements directly to common customer complaints or desires mentioned in reviews.

🎨 4. AESTHETIC INNOVATIONS
- Recommend visual design enhancements, including trending colors, packaging redesign, style updates, or improved visual appeal.
- Clearly relate aesthetic changes to current market trends, competitor analysis, or stated customer preferences identified within the reviews.

🎁 5. STRATEGIC BUNDLING OPPORTUNITIES
- Identify meaningful complementary physical products or accessories (avoid digital items) that enhance perceived value, practical usability, or overall customer satisfaction.
- Clearly justify each bundling recommendation based on insights derived from customer reviews or common product usage patterns.
- AVOID: liquids, breakables, digital items, anything that will provide complications for Amazon FBA, anything that will impact the size and weight of the package greatly (this will result in increased fees).

🎖️ BEST PRACTICES TO FOLLOW:
- Specificity & Precision: Deliver recommendations tightly connected to actual customer feedback and supported by explicit examples or quotes.
- Innovation & Differentiation: Prioritize ideas that will clearly distinguish the product from competitors and fulfill unaddressed customer needs.
- Customer-Centricity: Ensure insights and SSP recommendations clearly reflect authentic customer voices and verified preferences.
- Market Domination Perspective: Frame each recommendation as a strategic lever capable of significantly boosting competitive advantage, sales potential, and customer retention.

🥇 OBJECTIVE:
Transform this product from "just another commodity" into a uniquely irresistible solution—driving significant market share growth, customer loyalty, and sustained profitability.

${SSP_JSON_STRUCTURE}

Deliver your complete, structured analysis now.
`,
        },
      ],
      temperature: 0.7,
      response_format: { type: "json_object" },
    });

    const jsonResponse = JSON.parse(completion.choices[0].message.content);
    console.log(`✅ SSP recommendations generated successfully`);
    return jsonResponse;

  } catch (error) {
    console.error("❌ Error generating SSP recommendations:", error);
    throw error;
  }
}

// 6. COMBINED FUNCTION - Runs both analyses in sequence
async function generateFullReviewAnalysis(reviewsArray) {
  try {
    console.log(`🔄 Starting full review analysis pipeline...`);
    
    // Step 1: Generate initial review analysis
    const reviewAnalysis = await generateReviewAnalysisJSON(reviewsArray);
    console.log(`✅ Review analysis complete`);
    
    // Step 2: Generate SSP recommendations based on the analysis
    const sspRecommendations = await generateSSPRecommendations(reviewAnalysis);
    console.log(`✅ SSP recommendations complete`);
    
    // Combine both results
    return {
      review_analysis: reviewAnalysis,
      ssp_recommendations: sspRecommendations
    };
    
  } catch (error) {
    console.error("❌ Error in full analysis pipeline:", error);
    throw error;
  }
}

export default generateReviewAnalysisJSON;
export { generateSSPRecommendations, generateFullReviewAnalysis };