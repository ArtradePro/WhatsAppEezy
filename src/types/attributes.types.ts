export interface StandardizedAttributes {
  /**
   * Extracted physical dimensions (e.g., '200mm x 100mm x 65mm', '120 x 80 x 45 cm')
   */
  dimensions: string;

  /**
   * Primary material composition (e.g., 'Clay / Ceramic', 'Granite', 'Reinforced Concrete', 'Mild Steel')
   */
  material: string;

  /**
   * Commercial unit of measure (e.g., 'per m3', 'per 1000 bricks', 'per metric ton', 'per pallet', 'per unit')
   */
  unitOfMeasure: string;

  /**
   * Primary visual color or finish (e.g., 'Terracotta Red', 'Charcoal Gray', 'Natural Granite White')
   */
  color: string;

  /**
   * Confidence score from 0.0 to 1.0 of the extraction
   */
  confidenceScore: number;

  /**
   * AI-generated enriched title adhering to WhatsApp catalog guidelines
   */
  enrichedTitle: string;

  /**
   * AI-generated professional WhatsApp commerce description incorporating standardized specs
   */
  enrichedDescription: string;

  /**
   * Recommended Meta commerce category
   */
  suggestedCategory?: string;

  /**
   * Additional key-value technical specifications detected
   */
  additionalSpecs?: Record<string, string>;
}
