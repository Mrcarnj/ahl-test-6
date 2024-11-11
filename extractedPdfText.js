const fs = require('fs');
const axios = require('axios');
const pdf = require('pdf-parse');

// Replace with your Supabase URL
const pdfUrl = 'https://zxjzdtepjpnunjkqrsjy.supabase.co/storage/v1/object/public/rules/2024-25%20AHL%20Rule%20Book.pdf?t=2024-11-07T22%3A19%3A04.158Z';

const extractTextFromPDF = async () => {
    try {
        // Download PDF from Supabase
        const response = await axios.get(pdfUrl, { responseType: 'arraybuffer' });
        const pdfData = await pdf(response.data);

        // Split text by pages
        const pages = pdfData.text.split(/\f/);

        // Create an array of objects with page numbers and text
        const pageData = pages.map((text, index) => ({
            page: index + 1,
            text: text.trim(),
        }));

        // Save extracted text to JSON file
        fs.writeFileSync('src/lib/pdfText.json', JSON.stringify(pageData, null, 2));
        console.log('PDF text has been extracted and saved to pdfText.json');
    } catch (error) {
        console.error('Error extracting PDF text:', error);
    }
};

// Run the extraction
extractTextFromPDF();
