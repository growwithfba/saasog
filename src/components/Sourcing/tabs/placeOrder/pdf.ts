import jsPDF from 'jspdf';
import type { SupplierQuoteRow } from '../../types';
import { formatCurrency } from '@/utils/formatters';

interface ChecklistItem {
  id: string;
  label: string;
  value: string | null;
  required: boolean;
  section: string;
}

interface GeneratePDFParams {
  productId: string;
  productName: string;
  supplier: SupplierQuoteRow;
  supplierWithMetrics: SupplierQuoteRow;
  checklistItems: ChecklistItem[];
  confirmedItems: Set<string>;
  orderQuantity: number;
  tier: 'short' | 'medium' | 'long';
  targetSalesPrice: number | null;
  referralFeePct: number | null;
  inspectionNotes: string;
}

export function generatePurchaseOrderPDF(params: GeneratePDFParams) {
  const {
    productId,
    productName,
    supplier,
    supplierWithMetrics,
    checklistItems,
    confirmedItems,
    orderQuantity,
    tier,
    targetSalesPrice,
    referralFeePct,
    inspectionNotes,
  } = params;

  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  const maxWidth = pageWidth - (margin * 2);
  let yPos = margin;

  // Helper to add a new page if needed
  const checkPageBreak = (requiredHeight: number = 10) => {
    if (yPos + requiredHeight > doc.internal.pageSize.getHeight() - margin) {
      doc.addPage();
      yPos = margin;
    }
  };

  // Header
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('Purchase Order', margin, yPos);
  yPos += 10;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Date: ${new Date().toLocaleDateString()}`, margin, yPos);
  yPos += 6;
  doc.text(`Product: ${productName}`, margin, yPos);
  yPos += 6;
  doc.text(`ASIN: ${productId}`, margin, yPos);
  yPos += 10;

  // Supplier Information
  checkPageBreak(20);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Supplier Information', margin, yPos);
  yPos += 8;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  if (supplier.supplierName) {
    doc.text(`Supplier Name: ${supplier.supplierName}`, margin, yPos);
    yPos += 6;
  }
  if (supplier.companyName) {
    doc.text(`Company Name: ${supplier.companyName}`, margin, yPos);
    yPos += 6;
  }
  if (supplier.alibabaUrl) {
    doc.text(`Alibaba URL: ${supplier.alibabaUrl}`, margin, yPos);
    yPos += 6;
  }
  yPos += 5;

  // Order Summary
  checkPageBreak(30);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Order Summary', margin, yPos);
  yPos += 8;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const tierLabel = tier === 'medium' ? 'Medium' : tier === 'long' ? 'Long' : 'Short';
  doc.text(`Pricing Tier: ${tierLabel}`, margin, yPos);
  yPos += 6;
  doc.text(`Order Quantity: ${orderQuantity}`, margin, yPos);
  yPos += 6;

  // Get tier-based cost per unit (not landed cost, just the base product cost)
  let costPerUnit: number | null = null;
  const effectiveIncoterms = supplier.incotermsAgreed || supplier.incoterms || 'DDP';
  
  if (tier === 'medium' && supplier.costPerUnitMediumTerm !== null && supplier.costPerUnitMediumTerm !== undefined) {
    costPerUnit = supplier.costPerUnitMediumTerm;
  } else if (tier === 'long' && supplier.costPerUnitLongTerm !== null && supplier.costPerUnitLongTerm !== undefined) {
    costPerUnit = supplier.costPerUnitLongTerm;
  } else {
    // Short-term (default)
    costPerUnit = (effectiveIncoterms === 'DDP' && supplier.ddpPrice && supplier.ddpPrice > 0)
      ? supplier.ddpPrice
      : (supplier.costPerUnitShortTerm ?? supplier.exwUnitCost ?? null);
  }
  
  if (costPerUnit !== null && costPerUnit > 0) {
    doc.text(`Cost per Unit: ${formatCurrency(costPerUnit)}`, margin, yPos);
    yPos += 6;
    doc.text(`Total Product Cost: ${formatCurrency(orderQuantity * costPerUnit)}`, margin, yPos);
    yPos += 6;
  }

  if (supplierWithMetrics.profitPerUnit !== null) {
    doc.text(`Profit per Unit: ${formatCurrency(supplierWithMetrics.profitPerUnit)}`, margin, yPos);
    yPos += 6;
  }
  if (supplierWithMetrics.marginPct !== null) {
    doc.text(`Margin: ${supplierWithMetrics.marginPct.toFixed(1)}%`, margin, yPos);
    yPos += 6;
  }
  if (supplierWithMetrics.roiPct !== null) {
    doc.text(`ROI: ${supplierWithMetrics.roiPct.toFixed(1)}%`, margin, yPos);
    yPos += 6;
  }
  yPos += 5;

  // Checklist by Section
  const sections = [
    { id: 'A', title: 'Supplier & Order Basics' },
    { id: 'B', title: 'Pricing & Quantities' },
    { id: 'C', title: 'Packaging — Unit Packaging' },
    { id: 'D', title: 'Carton / Logistics' },
    { id: 'E', title: 'Freight & Compliance' },
    { id: 'F', title: 'Amazon Fees' },
    { id: 'G', title: 'Inspection' },
    { id: 'H', title: 'Final confirmation' },
  ];

  sections.forEach(section => {
    const sectionItems = checklistItems.filter(item => item.section === section.id);
    if (sectionItems.length === 0) return;

    checkPageBreak(20);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`${section.id}) ${section.title}`, margin, yPos);
    yPos += 8;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    
    sectionItems.forEach(item => {
      checkPageBreak(8);
      const isConfirmed = confirmedItems.has(item.id);
      const checkmark = isConfirmed ? '✓' : '☐';
      const label = `${checkmark} ${item.label}${item.required ? ' (Required)' : ''}`;
      
      // Split long labels if needed
      const lines = doc.splitTextToSize(label, maxWidth);
      doc.text(lines, margin, yPos);
      yPos += lines.length * 5;

      if (item.value) {
        const valueLines = doc.splitTextToSize(`  Value: ${item.value}`, maxWidth - 10);
        doc.text(valueLines, margin + 5, yPos);
        yPos += valueLines.length * 5;
      } else if (item.id === 'inspection_ack' && inspectionNotes) {
        const notesLines = doc.splitTextToSize(`  Notes: ${inspectionNotes}`, maxWidth - 10);
        doc.text(notesLines, margin + 5, yPos);
        yPos += notesLines.length * 5;
      }
      yPos += 2;
    });
    yPos += 3;
  });

  // Signature Block
  checkPageBreak(30);
  yPos += 10;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Confirmed by:', margin, yPos);
  yPos += 15;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.line(margin, yPos, margin + 80, yPos); // Signature line
  yPos += 5;
  doc.text('Signature', margin, yPos);
  yPos += 10;

  doc.line(margin, yPos, margin + 80, yPos); // Date line
  yPos += 5;
  doc.text('Date', margin, yPos);

  // Generate filename
  const supplierName = supplier.displayName || supplier.supplierName || 'Supplier';
  const sanitized = supplierName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const filename = `PO_${sanitized}_${productId}_${new Date().toISOString().split('T')[0]}.pdf`;

  // Save PDF
  doc.save(filename);
}

