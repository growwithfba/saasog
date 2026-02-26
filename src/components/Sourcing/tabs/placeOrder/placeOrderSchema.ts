/**
 * Place Order Schema - Canonical field definitions from CSV
 * 
 * This schema defines the exact fields, order, and sections for the Place Order tab.
 * Column A = section header OR line item title
 * Column B (Mapped) = "mapped" means value comes from Supplier Quotes/Profit Overview
 * Column C (Required) = "Yes" means user MUST confirm it
 */

export interface PlaceOrderField {
  key: string; // Stable identifier (slugified from label)
  label: string; // Display label from CSV
  mapped: boolean; // If true, value comes from Supplier Quotes/Profit Overview
  required: boolean; // If true, must be confirmed
  autoCalculated?: boolean; // If true, value is auto-calculated
  sectionKey: string; // Section identifier
}

export interface PlaceOrderSection {
  key: string; // Stable identifier
  title: string; // Section header from CSV
  fields: PlaceOrderField[];
}

// Helper to create a stable key from a label
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '_')
    .replace(/^-+|-+$/g, '');
}

// Schema definition matching CSV exactly
export const PLACE_ORDER_SCHEMA: PlaceOrderSection[] = [
  {
    key: 'users_company_info',
    title: 'Users Company Info',
    fields: [
      { key: 'your_name', label: 'Your Name', mapped: false, required: true, sectionKey: 'users_company_info' },
      { key: 'company_name', label: 'Company Name', mapped: false, required: true, sectionKey: 'users_company_info' },
      { key: 'brand_name', label: 'Brand Name', mapped: false, required: false, sectionKey: 'users_company_info' },
      { key: 'company_address', label: 'Company Address', mapped: false, required: false, sectionKey: 'users_company_info' },
      { key: 'company_phone_number', label: 'Company Phone Number', mapped: false, required: false, sectionKey: 'users_company_info' },
      { key: 'purchase_order_number', label: 'Purchase Order Number', mapped: false, required: false, sectionKey: 'users_company_info' },
    ],
  },
  {
    key: 'supplier_information',
    title: 'Supplier Information',
    fields: [
      { key: 'supplier_name', label: 'Supplier Name', mapped: true, required: true, sectionKey: 'supplier_information' },
      { key: 'supplier_company_name', label: 'Company Name', mapped: true, required: true, sectionKey: 'supplier_information' },
      { key: 'supplier_address', label: 'Supplier Address', mapped: true, required: true, sectionKey: 'supplier_information' },
      { key: 'supplier_contact_number', label: 'Supplier Contact Number', mapped: true, required: true, sectionKey: 'supplier_information' },
      { key: 'supplier_email', label: 'Supplier Email', mapped: true, required: true, sectionKey: 'supplier_information' },
    ],
  },
  {
    key: 'product_information',
    title: 'Product Information',
    fields: [
      { key: 'product_name', label: 'Product Name', mapped: true, required: true, sectionKey: 'product_information' },
      { key: 'product_sku', label: 'Product SKU', mapped: false, required: true, sectionKey: 'product_information' },
      { key: 'product_size', label: 'Product Size', mapped: false, required: true, sectionKey: 'product_information' },
      { key: 'color', label: 'Color', mapped: false, required: true, sectionKey: 'product_information' },
      { key: 'material_used', label: 'Material Used', mapped: false, required: true, sectionKey: 'product_information' },
      { key: 'brand_name_product', label: 'Brand Name', mapped: false, required: true, sectionKey: 'product_information' },
      { key: 'brand_logo', label: 'Brand Logo', mapped: false, required: false, sectionKey: 'product_information' },
      { key: 'brand_logo_sent', label: 'Brand Logo Sent', mapped: false, required: true, sectionKey: 'product_information' },
      { key: 'upc_fnsku', label: 'UPC / FNSKU', mapped: false, required: true, sectionKey: 'product_information' },
      { key: 'additional_details', label: 'Additional Details', mapped: false, required: false, sectionKey: 'product_information' },
    ],
  },
  {
    key: 'fba_fees',
    title: 'FBA Fees',
    fields: [
      { key: 'fba_fee', label: 'FBA Fee', mapped: true, required: true, sectionKey: 'fba_fees' },
      { key: 'referral_fee', label: 'Referral Fee', mapped: true, required: true, sectionKey: 'fba_fees' },
    ],
  },
  {
    key: 'order_basics',
    title: 'Order Basics',
    fields: [
      { key: 'moq', label: 'MOQ', mapped: true, required: true, sectionKey: 'order_basics' },
      { key: 'cost_price', label: 'Cost Price', mapped: true, required: true, sectionKey: 'order_basics' },
      { key: 'total_price', label: 'Total Price', mapped: true, required: true, sectionKey: 'order_basics' },
      { key: 'lead_time', label: 'Lead time', mapped: true, required: true, sectionKey: 'order_basics' },
      { key: 'payment_terms', label: 'Payment terms', mapped: true, required: true, sectionKey: 'order_basics' },
      { key: 'incoterms', label: 'Incoterms', mapped: true, required: true, sectionKey: 'order_basics' },
      { key: 'sample_refund_agreed', label: 'Sample Refund Agreed', mapped: false, required: false, sectionKey: 'order_basics' },
      { key: 'inspection_agreed', label: 'Inspection Agreed', mapped: false, required: false, sectionKey: 'order_basics' },
      { key: 'proforma_invoice_total', label: 'Proforma Invoice Total', mapped: false, required: true, autoCalculated: true, sectionKey: 'order_basics' },
    ],
  },
  {
    key: 'product_package_information',
    title: 'Product Package Information',
    fields: [
      { key: 'unit_package_dimensions', label: 'Unit Package Dimensions (L×W×H)', mapped: true, required: true, sectionKey: 'product_package_information' },
      { key: 'unit_package_weight', label: 'Unit Package Weight', mapped: true, required: true, sectionKey: 'product_package_information' },
      { key: 'packaging_cost', label: 'Packaging Cost', mapped: true, required: true, sectionKey: 'product_package_information' },
      { key: 'labelling_cost', label: 'Labelling Cost', mapped: true, required: true, sectionKey: 'product_package_information' },
      { key: 'product_label_agreed', label: 'Product Label Agreed', mapped: false, required: true, sectionKey: 'product_package_information' },
      { key: 'packaging_type', label: 'Packaging Type', mapped: false, required: false, sectionKey: 'product_package_information' },
      { key: 'package_design', label: 'Package Design', mapped: false, required: false, sectionKey: 'product_package_information' },
      { key: 'units_per_package', label: 'Units Per Package', mapped: false, required: false, sectionKey: 'product_package_information' },
      { key: 'product_label_sent', label: 'Product Label Sent', mapped: false, required: true, sectionKey: 'product_package_information' },
    ],
  },
  {
    key: 'super_selling_points',
    title: 'Super Selling Points',
    fields: [
      { key: 'functional_changes', label: 'Functional Changes', mapped: true, required: false, sectionKey: 'super_selling_points' },
      { key: 'quality_changes', label: 'Quality Changes', mapped: true, required: false, sectionKey: 'super_selling_points' },
      { key: 'aesthetic_changes', label: 'Aesthetic Changes', mapped: true, required: false, sectionKey: 'super_selling_points' },
      { key: 'bundling_changes', label: 'Bundling Changes', mapped: true, required: false, sectionKey: 'super_selling_points' },
      { key: 'quantity_changes', label: 'Quantity Changes', mapped: true, required: false, sectionKey: 'super_selling_points' },
    ],
  },
  {
    key: 'carton_information',
    title: 'Carton Information',
    fields: [
      { key: 'carton_dimensions', label: 'Carton Dimensions (L×W×H)', mapped: true, required: true, sectionKey: 'carton_information' },
      { key: 'carton_weight', label: 'Carton Weight', mapped: true, required: true, sectionKey: 'carton_information' },
      { key: 'units_per_carton', label: 'Units/Carton', mapped: true, required: true, sectionKey: 'carton_information' },
      { key: 'total_cartons', label: 'Total Cartons', mapped: false, required: true, autoCalculated: true, sectionKey: 'carton_information' },
      { key: 'cbm_per_carton', label: 'CBM/Carton', mapped: false, required: true, autoCalculated: true, sectionKey: 'carton_information' },
      { key: 'total_cbm', label: 'Total CBM', mapped: false, required: true, autoCalculated: true, sectionKey: 'carton_information' },
    ],
  },
  {
    key: 'freight_compliance',
    title: 'Freight & Compliance',
    fields: [
      { key: 'incoterms_freight', label: 'Incoterms', mapped: true, required: true, sectionKey: 'freight_compliance' },
      { key: 'freight_forwarder', label: 'Freight Forwarder', mapped: false, required: false, sectionKey: 'freight_compliance' },
      { key: 'shipping_time', label: 'Shipping Time', mapped: false, required: false, sectionKey: 'freight_compliance' },
      { key: 'hts_code', label: 'HTS Code', mapped: false, required: false, sectionKey: 'freight_compliance' },
      { key: 'duty_rate', label: 'Duty Rate', mapped: false, required: false, sectionKey: 'freight_compliance' },
      { key: 'tariff_code', label: 'Tariff Code', mapped: false, required: false, sectionKey: 'freight_compliance' },
      { key: 'freight_cost_per_unit', label: 'Freight Cost/Unit (USD)', mapped: true, required: true, sectionKey: 'freight_compliance' },
      { key: 'duty_cost_per_unit', label: 'Duty Cost/Unit (USD)', mapped: true, required: true, sectionKey: 'freight_compliance' },
      { key: 'tariff_cost_per_unit', label: 'Tariff Cost/Unit (USD)', mapped: true, required: true, sectionKey: 'freight_compliance' },
      { key: 'additional_customs_documents', label: 'Additional Customs Documents Required', mapped: false, required: false, sectionKey: 'freight_compliance' },
      { key: 'additional_notes_for_supplier', label: 'Additional Notes For Supplier', mapped: false, required: false, sectionKey: 'freight_compliance' },
    ],
  },
];

// Get all fields flattened
export function getAllFields(): PlaceOrderField[] {
  return PLACE_ORDER_SCHEMA.flatMap(section => section.fields);
}

// Get field by key
export function getFieldByKey(key: string): PlaceOrderField | undefined {
  return getAllFields().find(field => field.key === key);
}

// Get section by key
export function getSectionByKey(key: string): PlaceOrderSection | undefined {
  return PLACE_ORDER_SCHEMA.find(section => section.key === key);
}
