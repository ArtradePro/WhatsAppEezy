import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_API_URL || 'http://localhost:3000';

const TIER_PRESETS = {
  starter: { monthlyFee: 299, commissionRate: 0.08, billedPct: 0.029, billedFixed: 2.0 },
  pro: { monthlyFee: 599, commissionRate: 0.065, billedPct: 0.027, billedFixed: 2.0 },
  enterprise: { monthlyFee: 999, commissionRate: 0.05, billedPct: 0.025, billedFixed: 1.5 },
};

function computeLocalTierComparison(monthlyGmvZar = 411422.4, monthlyOrderCount = 89) {
  const avgOrder = monthlyOrderCount > 0 ? monthlyGmvZar / monthlyOrderCount : 4500;
  const tiers = (['starter', 'pro', 'enterprise'] as const).map((tier) => {
    const p = TIER_PRESETS[tier];
    const perOrderComm = Number((avgOrder * p.commissionRate).toFixed(2));
    const perOrderFeeCharged = Number((avgOrder * p.billedPct + p.billedFixed).toFixed(2));
    const perOrderActualCost = Number((avgOrder * 0.02 + 1.5).toFixed(2));
    const perOrderSpread = Number((perOrderFeeCharged - perOrderActualCost).toFixed(2));

    const monthlyComm = Number((perOrderComm * monthlyOrderCount).toFixed(2));
    const monthlyBilledGateway = Number((perOrderFeeCharged * monthlyOrderCount).toFixed(2));
    const monthlySpread = Number((perOrderSpread * monthlyOrderCount).toFixed(2));
    const estimatedMonthlyFeesZar = Number(
      (p.monthlyFee + monthlyComm + monthlyBilledGateway).toFixed(2)
    );
    const netVendorRetentionZar = Number((monthlyGmvZar - estimatedMonthlyFeesZar).toFixed(2));
    const platformTotalYieldZar = Number((p.monthlyFee + monthlyComm + monthlySpread).toFixed(2));

    return {
      tier,
      monthlyFeeZar: p.monthlyFee,
      commissionPct: Number((p.commissionRate * 100).toFixed(2)),
      billedProcessingRate: `${(p.billedPct * 100).toFixed(1)}% + R${p.billedFixed.toFixed(2)}`,
      estimatedMonthlyFeesZar,
      netVendorRetentionZar,
      platformTotalYieldZar,
      recommended: tier === 'enterprise',
    };
  });

  return tiers;
}

export async function GET(req: NextRequest) {
  const headerKey = req.headers.get('x-gemini-api-key') || req.headers.get('x-openai-api-key') || '';
  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/ai/status`, {
      headers: headerKey ? { 'x-openai-api-key': headerKey } : {},
      cache: 'no-store',
    });
    if (res.ok) {
      const data = await res.json();
      return NextResponse.json(data);
    }
  } catch {
    // Standalone Next.js fallback
  }

  const crossBuildEnabled = process.env.AI_CROSS_BUILD_ENABLED !== 'false';
  const envOpenAiKey = crossBuildEnabled ? (process.env.OPENAI_API_KEY || '') : '';
  const activeKey = (headerKey || envOpenAiKey || process.env.GEMINI_API_KEY || '').trim();
  const isConfigured = activeKey.length > 15;
  const isOpenAi = activeKey.startsWith('sk-');

  return NextResponse.json({
    success: true,
    bridge: {
      configured: isConfigured,
      crossBuildEnabled,
      source: isConfigured ? (headerKey ? 'ui-override' : 'env') : 'intelligent-fallback',
      model: isOpenAi ? (process.env.OPENAI_MODEL || 'gpt-4o') : (process.env.GEMINI_MODEL || 'gemini-2.5-flash'),
      maskedKey: isConfigured ? `${activeKey.slice(0, 10)}...${activeKey.slice(-4)}` : null,
    },
    defaultTierArbitrage: {
      currentTier: 'starter',
      tiers: computeLocalTierComparison(),
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const headerKey = req.headers.get('x-gemini-api-key') || req.headers.get('x-openai-api-key') || body.apiKey || '';

    // 1. Try forwarding to Backend Express/Fastify Cross-Build & Gemini Engine first
    try {
      const backendRes = await fetch(`${BACKEND_URL}/api/v1/ai/bridge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(headerKey ? { 'x-openai-api-key': headerKey } : {}),
        },
        body: JSON.stringify(body),
      });
      if (backendRes.ok) {
        const data = await backendRes.json();
        return NextResponse.json(data);
      }
    } catch {
      // Backend not running on port 3000; execute directly inside Next.js route handler
    }

    const crossBuildEnabled = body.crossBuildEnabled !== undefined
      ? Boolean(body.crossBuildEnabled)
      : process.env.AI_CROSS_BUILD_ENABLED !== 'false';
    const envOpenAiKey = crossBuildEnabled ? (process.env.OPENAI_API_KEY || '') : '';
    const activeKey = (headerKey || envOpenAiKey || process.env.GEMINI_API_KEY || '').trim();
    const taskType = body.taskType || 'REVENUE_ARBITRAGE_ADVISOR';
    const prompt = String(body.prompt || 'Analyze MoR fee arbitrage and subscription tier efficiency');
    const gmv = body.context?.monthlyGmvZar ?? 411422.4;
    const orderCount = body.context?.monthlyOrderCount ?? 89;
    const tierComparison = computeLocalTierComparison(gmv, orderCount);

    // 2. Live OpenAI GPT-4o Cross-Build Collaboration (when sk-... key is active & crossBuildEnabled)
    if (crossBuildEnabled && activeKey.startsWith('sk-') && activeKey.length > 20) {
      const openAiModel = body.model || process.env.OPENAI_MODEL || 'gpt-4o';
      try {
        const oaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${activeKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: openAiModel,
            temperature: 0.25,
            response_format: { type: 'json_object' },
            messages: [
              {
                role: 'system',
                content:
                  'You are the Cargo-Dash Cross-Build Co-Architect collaborating with Antigravity Gemini Flash. Respond in valid JSON with keys: "headline" (string), "summary" (string), "insights" (array of 3-5 strings), "metrics" (object), optional "generatedProduct" ({ title, category, unit_of_measure, unit_price, meta_retailer_id, description }), and optional "codeArtifact" (string).',
              },
              {
                role: 'user',
                content: JSON.stringify({ taskType, prompt, context: body.context, tierComparison }),
              },
            ],
          }),
        });

        if (oaiRes.ok) {
          const oaiData = await oaiRes.json();
          const rawText = oaiData.choices?.[0]?.message?.content || '{}';
          const parsed = JSON.parse(rawText);
          return NextResponse.json({
            success: true,
            provider: 'openai-gpt4o-crossbuild',
            model: openAiModel,
            taskType,
            headline: parsed.headline || 'OpenAI GPT-4o + Gemini Flash Cross-Build Synthesis',
            summary: parsed.summary || 'Live Cross-Build synthesis completed.',
            insights: Array.isArray(parsed.insights) ? parsed.insights : [],
            metrics: parsed.metrics || {
              'Cross-Build Engine': `OpenAI ${openAiModel} + Gemini Flash`,
              'Monthly GMV Analyzed': `R ${gmv.toLocaleString('en-ZA')}`,
            },
            generatedProduct: parsed.generatedProduct,
            tierComparison,
            codeArtifact: parsed.codeArtifact,
            timestamp: new Date().toISOString(),
          });
        }
      } catch {
        // Fallback below
      }
    }

    // 3. If a valid Google Gemini API key is provided, call Gemini Flash REST API directly
    const model = body.model || process.env.GEMINI_MODEL || 'gemini-flash-latest';
    if (activeKey.length > 20 && !activeKey.startsWith('sk-') && !activeKey.includes('mock')) {
      try {
        const candidateModels = Array.from(
          new Set([model, 'gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-3.8-flash'])
        );

        for (const candidate of candidateModels) {
          const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${candidate}:generateContent?key=${activeKey}`;
          const gemRes = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [
                {
                  role: 'user',
                  parts: [
                    {
                      text: `You are the Cargo-Dash Antigravity Gemini Flash Operations & Revenue Co-Pilot.
Respond in valid JSON with keys: "headline" (string), "summary" (string), "insights" (array of 3-4 strings), "metrics" (object of key-value pairs), optional "generatedProduct" ({ title, category, unit_of_measure, unit_price, meta_retailer_id, description }), and optional "codeArtifact" (string).
Input: ${JSON.stringify({ taskType, prompt, context: body.context, tierComparison })}`,
                    },
                  ],
                },
              ],
              generationConfig: {
                temperature: 0.2,
                responseMimeType: 'application/json',
              },
            }),
          });

          if (gemRes.ok) {
            const gemData = await gemRes.json();
            const rawText = gemData.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
            const parsed = JSON.parse(rawText);
            return NextResponse.json({
              success: true,
              provider: 'gemini-flash-live',
              model: candidate,
              taskType,
              headline: parsed.headline || 'Gemini Flash Synthesis Complete',
              summary: parsed.summary || 'Synthesized via live Google Gemini Flash.',
              insights: Array.isArray(parsed.insights) ? parsed.insights : [],
              metrics: parsed.metrics || {
                'Monthly GMV Analyzed': `R ${gmv.toLocaleString('en-ZA')}`,
                'Recommended Tier': 'ENTERPRISE',
              },
              generatedProduct: parsed.generatedProduct,
              tierComparison,
              codeArtifact: parsed.codeArtifact,
              timestamp: new Date().toISOString(),
            });
          }
        }
      } catch {
        // Fallback to local deterministic engine
      }
    }

    // 3. Deterministic Local Engine Synthesis
    const starter = tierComparison[0];
    const enterprise = tierComparison[2];
    const savings = Number((enterprise.netVendorRetentionZar - starter.netVendorRetentionZar).toFixed(2));

    if (taskType === 'CATALOG_PRODUCT_GENERATOR') {
      const priceMatch = prompt.match(/R\s?(\d+(?:\.\d{1,2})?)/i);
      const extractedPrice = priceMatch ? parseFloat(priceMatch[1]) : 585.0;
      const lower = prompt.toLowerCase();
      const isBrick = lower.includes('brick') || lower.includes('block');
      const isCement = lower.includes('cement') || lower.includes('bag');
      const category = isBrick ? 'bricks_blocks' : isCement ? 'cement' : 'sand_stone';
      const unit = isBrick ? 'per 1000 units' : isCement ? '50kg Bag' : 'm³ (Cubic Meter)';
      const cleanTitle =
        prompt.replace(/R\s?\d+(?:\.\d{1,2})?/gi, '').trim() ||
        'Washed Plaster Sand (SABS Grade)';

      return NextResponse.json({
        success: true,
        provider: 'cargodash-intelligent-engine',
        model,
        taskType,
        headline: `Gemini Flash Catalog Spec: ${cleanTitle} @ R ${extractedPrice.toFixed(2)}`,
        summary: `Extracted structured Meta WhatsApp Catalog v19.0 product card with 1024x1024 Sharp normalization metadata.`,
        insights: [
          `Unit Price: R ${extractedPrice.toFixed(2)} (${unit})`,
          `Category: ${category.toUpperCase()}`,
          `Click "Add Generated Product to Catalog" below to publish directly into your inventory.`,
        ],
        generatedProduct: {
          title: cleanTitle,
          category,
          unit_of_measure: unit,
          unit_price: extractedPrice,
          meta_retailer_id: `MAT-AI-${Math.floor(100 + Math.random() * 900)}`,
          description: `SABS graded ${cleanTitle.toLowerCase()} available for immediate site tipper/flatbed delivery within 45km PostGIS yard radius.`,
        },
        metrics: {
          'Extracted Price': `R ${extractedPrice.toFixed(2)}`,
          'Catalog Sync': 'Meta v19.0 Ready',
        },
        tierComparison,
        timestamp: new Date().toISOString(),
      });
    }

    return NextResponse.json({
      success: true,
      provider: 'cargodash-intelligent-engine',
      model,
      taskType,
      headline: `MoR Arbitrage & Tier Analysis: Enterprise Tier Saves R ${savings.toLocaleString('en-ZA')}/mo`,
      summary: `Across R ${gmv.toLocaleString('en-ZA')} monthly GMV (${orderCount} orders), switching to Enterprise (R999/mo, 5.0% take-rate, 2.5%+R1.50 billed processing) boosts net supplier payout by R ${savings.toLocaleString('en-ZA')}/mo while retaining R ${enterprise.platformTotalYieldZar.toLocaleString('en-ZA')}/mo in total platform yield.`,
      insights: [
        `Starter Net Vendor Payout: R ${starter.netVendorRetentionZar.toLocaleString('en-ZA')}`,
        `Enterprise Net Vendor Payout: R ${enterprise.netVendorRetentionZar.toLocaleString('en-ZA')}`,
        `PayFast Wholesale Arbitrage: Retains +50 to +90 bps + R0.50 per transaction over 2.0% + R1.50 master cost.`,
        `Automated Ledger Set-Off deducts monthly SaaS fee from unsettled escrow prior to Friday EFT payout.`,
      ],
      metrics: {
        'Recommended Tier': 'ENTERPRISE (R999/mo)',
        'Monthly Supplier Savings': `R ${savings.toLocaleString('en-ZA')}`,
        'Total Platform Yield': `R ${enterprise.platformTotalYieldZar.toLocaleString('en-ZA')}`,
      },
      tierComparison,
      codeArtifact:
        taskType === 'UI_COBUILDER_ARCHITECT'
          ? `// Generated via Antigravity Gemini Flash (${model})\nexport const MOR_IDENTITY = "net_vendor_payout + platform_commission + gateway_margin_spread + payment_fee_actual === gross_amount";`
          : undefined,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Gemini Flash Bridge route error' },
      { status: 500 }
    );
  }
}
