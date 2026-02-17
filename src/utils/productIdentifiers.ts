export function getProductAsin(input: any): string | null {
  if (!input) return null;
  const direct =
    input.asin ??
    input.originalAsin ??
    input.sourceAsin ??
    input.original_asin ??
    input.productData?.asin ??
    input.productData?.product?.asin ??
    input.productData?.mainProduct?.asin ??
    input.submission_data?.productData?.asin ??
    input.submission_data?.productData?.product?.asin ??
    input.submission_data?.productData?.mainProduct?.asin ??
    null;

  if (typeof direct === 'string' && direct.trim().length > 0) {
    const normalized = direct.trim();
    if (['unknown', 'undefined', 'null'].includes(normalized.toLowerCase())) {
      return null;
    }
    return normalized;
  }

  return null;
}
