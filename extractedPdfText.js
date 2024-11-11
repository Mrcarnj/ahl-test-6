const fs = require('fs');
const pdf = require('pdf-parse');
const axios = require('axios');

// URL of the PDF file in Supabase
const pdfUrl = 'https://zxjzdtepjpnunjkqrsjy.supabase.co/storage/v1/object/public/rules/2024-25%20NHL%20Situation%20Handbook%20(CONFIDENTIAL).pdf?t=2024-11-11T00%3A19%3A09.244Z';

const extractTextFromPDF = async () => {
    try {
        // Download PDF from Supabase
        const response = await axios.get(pdfUrl, { responseType: 'arraybuffer' });
        const pdfData = await pdf(response.data);

        // Split text by the identified separator "\ni"
        const pages = pdfData.text.split('\n\nNHL Rules  Situation Handbook \n');

        // Map pages to an array of objects with page number and text
        const pageData = pages.map((text, index) => ({
            page: index + 4,
            text: text.trim(),
        }));

        // Write the extracted data to a JSON file
        fs.writeFileSync('src/lib/SituationBookPdfText.json', JSON.stringify(pageData, null, 2));
        console.log('PDF text has been extracted and saved to RuleBookPdfText.json');
    } catch (error) {
        console.error('Error extracting PDF text:', error);
    }
};

// Run the extraction
extractTextFromPDF();
