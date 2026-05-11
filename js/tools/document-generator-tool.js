import { Logger } from '../utils/logger.js';

/**
 * Tool for generating documents using HTML/CSS/JS web artifacts.
 * Creates modern office-style documents that can be previewed and downloaded as PDF.
 */
export class DocumentGeneratorTool {
    constructor() {
        this.accessToken = null;
    }

    /**
     * Sets the OAuth access token (not used for this tool, but required by ToolManager)
     */
    setAccessToken(token) {
        this.accessToken = token;
    }

    /**
     * Returns the tool declaration for the Gemini API.
     */
    getDeclaration() {
        return {
            name: 'document_generator',
            description: 'Generate documents like contracts, invoices, reports, letters, and other office documents. Documents are created as modern, professional web artifacts that can be previewed and downloaded as PDF.',
            parameters: {
                type: 'object',
                properties: {
                    documentType: {
                        type: 'string',
                        description: 'Type of document to generate: contract, invoice, report, letter, memo, proposal, resume, or custom',
                        enum: ['contract', 'invoice', 'report', 'letter', 'memo', 'proposal', 'resume', 'custom']
                    },
                    title: {
                        type: 'string',
                        description: 'Title of the document'
                    },
                    content: {
                        type: 'string',
                        description: 'Main content of the document. Can include sections, paragraphs, lists, etc.'
                    },
                    metadata: {
                        type: 'object',
                        description: 'Additional metadata like date, recipient, sender, etc.',
                        properties: {
                            date: { type: 'string' },
                            recipient: { type: 'string' },
                            sender: { type: 'string' },
                            reference: { type: 'string' },
                            company: { type: 'string' }
                        }
                    }
                },
                required: ['documentType', 'title', 'content']
            }
        };
    }

    /**
     * Executes the document generation.
     */
    async execute(args) {
        try {
            const { documentType, title, content, metadata = {} } = args;
            
            const document = this.generateDocument(documentType, title, content, metadata);
            
            return {
                success: true,
                document: document,
                documentType: documentType,
                title: title
            };
        } catch (error) {
            Logger.error('Document generator tool execution failed', error);
            throw error;
        }
    }

    /**
     * Generates an HTML document based on the document type.
     */
    generateDocument(documentType, title, content, metadata) {
        const templates = {
            contract: this.generateContractTemplate,
            invoice: this.generateInvoiceTemplate,
            report: this.generateReportTemplate,
            letter: this.generateLetterTemplate,
            memo: this.generateMemoTemplate,
            proposal: this.generateProposalTemplate,
            resume: this.generateResumeTemplate,
            custom: this.generateCustomTemplate
        };

        const templateGenerator = templates[documentType] || templates.custom;
        return templateGenerator(title, content, metadata);
    }

    /**
     * Generates a contract document.
     */
    generateContractTemplate(title, content, metadata) {
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this.escapeHtml(title)}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; padding: 40px; background: #fff; }
        .document { max-width: 800px; margin: 0 auto; }
        .header { text-align: center; margin-bottom: 40px; border-bottom: 3px solid #2563eb; padding-bottom: 20px; }
        .header h1 { color: #1e40af; font-size: 28px; margin-bottom: 10px; }
        .header .subtitle { color: #64748b; font-size: 14px; }
        .section { margin-bottom: 30px; }
        .section h2 { color: #1e40af; font-size: 18px; margin-bottom: 15px; border-left: 4px solid #2563eb; padding-left: 12px; }
        .section p { margin-bottom: 12px; text-align: justify; }
        .section ul { margin-left: 20px; margin-bottom: 12px; }
        .section li { margin-bottom: 8px; }
        .signature-section { margin-top: 50px; display: flex; justify-content: space-between; }
        .signature-box { width: 45%; text-align: center; }
        .signature-box .line { border-top: 1px solid #333; margin: 40px 0 10px; }
        .metadata { color: #64748b; font-size: 12px; margin-bottom: 30px; }
        .metadata p { margin-bottom: 5px; }
        @media print { body { padding: 20px; } }
    </style>
</head>
<body>
    <div class="document">
        <div class="header">
            <h1>${this.escapeHtml(title)}</h1>
            <div class="subtitle">CONTRACT AGREEMENT</div>
        </div>
        
        <div class="metadata">
            ${metadata.date ? `<p><strong>Date:</strong> ${this.escapeHtml(metadata.date)}</p>` : ''}
            ${metadata.reference ? `<p><strong>Reference:</strong> ${this.escapeHtml(metadata.reference)}</p>` : ''}
            ${metadata.company ? `<p><strong>Company:</strong> ${this.escapeHtml(metadata.company)}</p>` : ''}
        </div>
        
        <div class="section">
            ${this.formatContent(content)}
        </div>
        
        <div class="signature-section">
            <div class="signature-box">
                <p><strong>${metadata.sender || 'Party A'}</strong></p>
                <div class="line"></div>
                <p>Signature</p>
            </div>
            <div class="signature-box">
                <p><strong>${metadata.recipient || 'Party B'}</strong></p>
                <div class="line"></div>
                <p>Signature</p>
            </div>
        </div>
    </div>
</body>
</html>`;
    }

    /**
     * Generates an invoice document.
     */
    generateInvoiceTemplate(title, content, metadata) {
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this.escapeHtml(title)}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; padding: 40px; background: #fff; }
        .document { max-width: 800px; margin: 0 auto; }
        .header { display: flex; justify-content: space-between; margin-bottom: 40px; border-bottom: 3px solid #2563eb; padding-bottom: 20px; }
        .header h1 { color: #1e40af; font-size: 28px; }
        .header .invoice-number { color: #64748b; font-size: 14px; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-bottom: 30px; }
        .info-box h3 { color: #1e40af; font-size: 14px; margin-bottom: 10px; }
        .info-box p { color: #64748b; font-size: 13px; margin-bottom: 5px; }
        .section { margin-bottom: 30px; }
        .section h2 { color: #1e40af; font-size: 18px; margin-bottom: 15px; border-left: 4px solid #2563eb; padding-left: 12px; }
        .section p { margin-bottom: 12px; }
        .total-section { background: #f8fafc; padding: 20px; border-radius: 8px; margin-top: 30px; }
        .total-section .total { font-size: 24px; font-weight: bold; color: #1e40af; text-align: right; }
        @media print { body { padding: 20px; } }
    </style>
</head>
<body>
    <div class="document">
        <div class="header">
            <h1>INVOICE</h1>
            <div class="invoice-number">
                <p><strong>${this.escapeHtml(title)}</strong></p>
                ${metadata.reference ? `<p>Invoice #${this.escapeHtml(metadata.reference)}</p>` : ''}
                ${metadata.date ? `<p>Date: ${this.escapeHtml(metadata.date)}</p>` : ''}
            </div>
        </div>
        
        <div class="info-grid">
            <div class="info-box">
                <h3>FROM</h3>
                ${metadata.sender ? `<p>${this.escapeHtml(metadata.sender)}</p>` : ''}
                ${metadata.company ? `<p>${this.escapeHtml(metadata.company)}</p>` : ''}
            </div>
            <div class="info-box">
                <h3>TO</h3>
                ${metadata.recipient ? `<p>${this.escapeHtml(metadata.recipient)}</p>` : ''}
            </div>
        </div>
        
        <div class="section">
            ${this.formatContent(content)}
        </div>
        
        <div class="total-section">
            <div class="total">Total: TBD</div>
        </div>
    </div>
</body>
</html>`;
    }

    /**
     * Generates a report document.
     */
    generateReportTemplate(title, content, metadata) {
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this.escapeHtml(title)}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; padding: 40px; background: #fff; }
        .document { max-width: 800px; margin: 0 auto; }
        .header { text-align: center; margin-bottom: 40px; border-bottom: 3px solid #2563eb; padding-bottom: 20px; }
        .header h1 { color: #1e40af; font-size: 28px; margin-bottom: 10px; }
        .header .subtitle { color: #64748b; font-size: 14px; }
        .metadata { color: #64748b; font-size: 12px; margin-bottom: 30px; }
        .metadata p { margin-bottom: 5px; }
        .section { margin-bottom: 30px; }
        .section h2 { color: #1e40af; font-size: 20px; margin-bottom: 15px; border-left: 4px solid #2563eb; padding-left: 12px; }
        .section h3 { color: #475569; font-size: 16px; margin-bottom: 10px; margin-top: 20px; }
        .section p { margin-bottom: 12px; text-align: justify; }
        .section ul { margin-left: 20px; margin-bottom: 12px; }
        .section li { margin-bottom: 8px; }
        @media print { body { padding: 20px; } }
    </style>
</head>
<body>
    <div class="document">
        <div class="header">
            <h1>${this.escapeHtml(title)}</h1>
            <div class="subtitle">REPORT</div>
        </div>
        
        <div class="metadata">
            ${metadata.date ? `<p><strong>Date:</strong> ${this.escapeHtml(metadata.date)}</p>` : ''}
            ${metadata.company ? `<p><strong>Organization:</strong> ${this.escapeHtml(metadata.company)}</p>` : ''}
            ${metadata.sender ? `<p><strong>Prepared by:</strong> ${this.escapeHtml(metadata.sender)}</p>` : ''}
        </div>
        
        <div class="section">
            ${this.formatContent(content)}
        </div>
    </div>
</body>
</html>`;
    }

    /**
     * Generates a letter document.
     */
    generateLetterTemplate(title, content, metadata) {
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this.escapeHtml(title)}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; padding: 40px; background: #fff; }
        .document { max-width: 800px; margin: 0 auto; }
        .header { margin-bottom: 40px; }
        .header h1 { color: #1e40af; font-size: 28px; margin-bottom: 10px; }
        .sender-info { color: #64748b; font-size: 14px; margin-bottom: 20px; }
        .date { color: #64748b; font-size: 14px; margin-bottom: 30px; }
        .recipient { color: #333; font-size: 16px; margin-bottom: 30px; font-weight: bold; }
        .section { margin-bottom: 20px; }
        .section p { margin-bottom: 12px; text-align: justify; }
        .signature { margin-top: 50px; }
        .signature .line { border-top: 1px solid #333; width: 200px; margin-bottom: 10px; }
        @media print { body { padding: 20px; } }
    </style>
</head>
<body>
    <div class="document">
        <div class="header">
            <h1>${this.escapeHtml(title)}</h1>
        </div>
        
        <div class="sender-info">
            ${metadata.sender ? `<p>${this.escapeHtml(metadata.sender)}</p>` : ''}
            ${metadata.company ? `<p>${this.escapeHtml(metadata.company)}</p>` : ''}
        </div>
        
        <div class="date">
            ${metadata.date ? `<p>${this.escapeHtml(metadata.date)}</p>` : ''}
        </div>
        
        <div class="recipient">
            ${metadata.recipient ? `<p>${this.escapeHtml(metadata.recipient)}</p>` : ''}
        </div>
        
        <div class="section">
            ${this.formatContent(content)}
        </div>
        
        <div class="signature">
            ${metadata.sender ? `<p>${this.escapeHtml(metadata.sender)}</p>` : ''}
            <div class="line"></div>
        </div>
    </div>
</body>
</html>`;
    }

    /**
     * Generates a memo document.
     */
    generateMemoTemplate(title, content, metadata) {
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this.escapeHtml(title)}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; padding: 40px; background: #fff; }
        .document { max-width: 800px; margin: 0 auto; }
        .header { background: #1e40af; color: white; padding: 20px; margin-bottom: 30px; border-radius: 8px; }
        .header h1 { font-size: 24px; margin-bottom: 5px; }
        .header .subtitle { font-size: 14px; opacity: 0.9; }
        .info-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 30px; }
        .info-item label { display: block; color: #64748b; font-size: 12px; margin-bottom: 5px; }
        .info-item span { color: #333; font-size: 14px; font-weight: 500; }
        .section { margin-bottom: 30px; }
        .section h2 { color: #1e40af; font-size: 18px; margin-bottom: 15px; }
        .section p { margin-bottom: 12px; text-align: justify; }
        @media print { body { padding: 20px; } }
    </style>
</head>
<body>
    <div class="document">
        <div class="header">
            <h1>${this.escapeHtml(title)}</h1>
            <div class="subtitle">MEMORANDUM</div>
        </div>
        
        <div class="info-grid">
            <div class="info-item">
                <label>TO</label>
                <span>${metadata.recipient || 'All Staff'}</span>
            </div>
            <div class="info-item">
                <label>FROM</label>
                <span>${metadata.sender || 'Management'}</span>
            </div>
            <div class="info-item">
                <label>DATE</label>
                <span>${metadata.date || new Date().toLocaleDateString()}</span>
            </div>
            <div class="info-item">
                <label>REF</label>
                <span>${metadata.reference || ''}</span>
            </div>
        </div>
        
        <div class="section">
            ${this.formatContent(content)}
        </div>
    </div>
</body>
</html>`;
    }

    /**
     * Generates a proposal document.
     */
    generateProposalTemplate(title, content, metadata) {
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this.escapeHtml(title)}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; padding: 40px; background: #fff; }
        .document { max-width: 800px; margin: 0 auto; }
        .header { text-align: center; margin-bottom: 40px; border-bottom: 3px solid #2563eb; padding-bottom: 20px; }
        .header h1 { color: #1e40af; font-size: 28px; margin-bottom: 10px; }
        .header .subtitle { color: #64748b; font-size: 14px; }
        .metadata { color: #64748b; font-size: 12px; margin-bottom: 30px; }
        .metadata p { margin-bottom: 5px; }
        .section { margin-bottom: 30px; }
        .section h2 { color: #1e40af; font-size: 20px; margin-bottom: 15px; border-left: 4px solid #2563eb; padding-left: 12px; }
        .section h3 { color: #475569; font-size: 16px; margin-bottom: 10px; margin-top: 20px; }
        .section p { margin-bottom: 12px; text-align: justify; }
        .section ul { margin-left: 20px; margin-bottom: 12px; }
        .section li { margin-bottom: 8px; }
        .highlight { background: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b; }
        @media print { body { padding: 20px; } }
    </style>
</head>
<body>
    <div class="document">
        <div class="header">
            <h1>${this.escapeHtml(title)}</h1>
            <div class="subtitle">PROPOSAL</div>
        </div>
        
        <div class="metadata">
            ${metadata.date ? `<p><strong>Date:</strong> ${this.escapeHtml(metadata.date)}</p>` : ''}
            ${metadata.company ? `<p><strong>Company:</strong> ${this.escapeHtml(metadata.company)}</p>` : ''}
            ${metadata.sender ? `<p><strong>Prepared by:</strong> ${this.escapeHtml(metadata.sender)}</p>` : ''}
            ${metadata.recipient ? `<p><strong>Submitted to:</strong> ${this.escapeHtml(metadata.recipient)}</p>` : ''}
        </div>
        
        <div class="section">
            ${this.formatContent(content)}
        </div>
    </div>
</body>
</html>`;
    }

    /**
     * Generates a resume document.
     */
    generateResumeTemplate(title, content, metadata) {
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this.escapeHtml(title)}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; padding: 40px; background: #fff; }
        .document { max-width: 800px; margin: 0 auto; }
        .header { text-align: center; margin-bottom: 40px; border-bottom: 3px solid #2563eb; padding-bottom: 20px; }
        .header h1 { color: #1e40af; font-size: 32px; margin-bottom: 10px; }
        .header .subtitle { color: #64748b; font-size: 16px; }
        .section { margin-bottom: 30px; }
        .section h2 { color: #1e40af; font-size: 20px; margin-bottom: 15px; border-left: 4px solid #2563eb; padding-left: 12px; }
        .section h3 { color: #475569; font-size: 16px; margin-bottom: 8px; margin-top: 15px; font-weight: 600; }
        .section p { margin-bottom: 8px; }
        .section ul { margin-left: 20px; margin-bottom: 12px; }
        .section li { margin-bottom: 6px; }
        .contact-info { text-align: center; color: #64748b; font-size: 14px; margin-bottom: 30px; }
        @media print { body { padding: 20px; } }
    </style>
</head>
<body>
    <div class="document">
        <div class="header">
            <h1>${this.escapeHtml(title)}</h1>
            <div class="subtitle">RESUME</div>
        </div>
        
        <div class="contact-info">
            ${metadata.sender ? `<p>${this.escapeHtml(metadata.sender)}</p>` : ''}
            ${metadata.company ? `<p>${this.escapeHtml(metadata.company)}</p>` : ''}
        </div>
        
        <div class="section">
            ${this.formatContent(content)}
        </div>
    </div>
</body>
</html>`;
    }

    /**
     * Generates a custom document.
     */
    generateCustomTemplate(title, content, metadata) {
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this.escapeHtml(title)}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; padding: 40px; background: #fff; }
        .document { max-width: 800px; margin: 0 auto; }
        .header { text-align: center; margin-bottom: 40px; border-bottom: 3px solid #2563eb; padding-bottom: 20px; }
        .header h1 { color: #1e40af; font-size: 28px; margin-bottom: 10px; }
        .metadata { color: #64748b; font-size: 12px; margin-bottom: 30px; }
        .metadata p { margin-bottom: 5px; }
        .section { margin-bottom: 30px; }
        .section h2 { color: #1e40af; font-size: 20px; margin-bottom: 15px; border-left: 4px solid #2563eb; padding-left: 12px; }
        .section p { margin-bottom: 12px; text-align: justify; }
        @media print { body { padding: 20px; } }
    </style>
</head>
<body>
    <div class="document">
        <div class="header">
            <h1>${this.escapeHtml(title)}</h1>
        </div>
        
        <div class="metadata">
            ${metadata.date ? `<p><strong>Date:</strong> ${this.escapeHtml(metadata.date)}</p>` : ''}
            ${metadata.sender ? `<p><strong>From:</strong> ${this.escapeHtml(metadata.sender)}</p>` : ''}
            ${metadata.recipient ? `<p><strong>To:</strong> ${this.escapeHtml(metadata.recipient)}</p>` : ''}
        </div>
        
        <div class="section">
            ${this.formatContent(content)}
        </div>
    </div>
</body>
</html>`;
    }

    /**
     * Formats content into HTML paragraphs and lists.
     */
    formatContent(content) {
        if (!content) return '<p>No content provided</p>';
        
        // Split by double newlines for paragraphs
        const paragraphs = content.split('\n\n');
        
        return paragraphs.map(para => {
            para = para.trim();
            if (!para) return '';
            
            // Check if it's a list (starts with - or *)
            if (para.startsWith('-') || para.startsWith('*')) {
                const items = para.split('\n').map(item => `<li>${this.escapeHtml(item.substring(1).trim())}</li>`).join('');
                return `<ul>${items}</ul>`;
            }
            
            return `<p>${this.escapeHtml(para)}</p>`;
        }).join('');
    }

    /**
     * Escapes HTML to prevent XSS.
     */
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}
