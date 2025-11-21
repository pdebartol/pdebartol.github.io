// BibTeX Parser and Publication Loader
async function loadPublications() {
    try {
        // Load bib files
        console.log('Loading bibliography files...');
        const [papersResponse, preprintsResponse] = await Promise.all([
            fetch('bibliography/papers.bib'),
            fetch('bibliography/preprints.bib')
        ]);

        // Check if responses are OK
        if (!papersResponse.ok) {
            throw new Error(`Failed to load papers.bib: ${papersResponse.status} ${papersResponse.statusText}`);
        }
        if (!preprintsResponse.ok) {
            throw new Error(`Failed to load preprints.bib: ${preprintsResponse.status} ${preprintsResponse.statusText}`);
        }

        const papersText = await papersResponse.text();
        const preprintsText = await preprintsResponse.text();

        console.log('Papers text length:', papersText.length);
        console.log('Preprints text length:', preprintsText.length);

        // Parse BibTeX entries
        const papers = parseBibTeX(papersText);
        console.log('Parsed papers:', papers.length, 'entries');
        console.log('Parsed papers keys:', papers.map(p => p.key));

        const preprints = parseBibTeX(preprintsText);
        console.log('Parsed preprints:', preprints.length, 'entries');

        // Organize papers by year
        const papersByYear = {};
        papers.forEach(paper => {
            const year = paper.year || 'Unknown';
            if (!papersByYear[year]) papersByYear[year] = [];
            papersByYear[year].push(paper);
        });
        console.log('Papers by year:', Object.keys(papersByYear));

        // Render publications
        renderPreprints(preprints);
        renderPapersByYear(papersByYear);

    } catch (error) {
        console.error('Error loading publications:', error);
        // Display error to user
        const preprintsContainer = document.getElementById('preprints-container');
        const publicationsContainer = document.getElementById('publications-container');
        const errorMsg = `<p style="color: #d32f2f; padding: 1rem; background: #ffebee; border-radius: 8px;">Error loading publications: ${error.message}</p>`;
        if (preprintsContainer) preprintsContainer.innerHTML = errorMsg;
        if (publicationsContainer) publicationsContainer.innerHTML = errorMsg;
    }
}

function parseBibTeX(bibText) {
    const entries = [];
    // Normalize line endings
    const text = bibText.replace(/\r\n/g, '\n');

    let pos = 0;
    while (pos < text.length) {
        // Find start of entry
        const start = text.indexOf('@', pos);
        if (start === -1) break;

        // Find entry type and key
        const openBrace = text.indexOf('{', start);
        if (openBrace === -1) {
            pos = start + 1;
            continue;
        }

        const type = text.substring(start + 1, openBrace).trim();
        const keyEnd = text.indexOf(',', openBrace);
        if (keyEnd === -1) {
            pos = openBrace + 1;
            continue;
        }

        const key = text.substring(openBrace + 1, keyEnd).trim();
        const entry = { key, type };

        // Parse fields
        let currentPos = keyEnd + 1;
        let braceCount = 1; // We are inside the entry's main brace

        while (braceCount > 0 && currentPos < text.length) {
            // Find next field
            const fieldMatch = text.substring(currentPos).match(/^\s*(\w+)\s*=\s*/);
            if (!fieldMatch) {
                // Check if we reached the end of the entry
                if (text[currentPos] === '}') {
                    braceCount--;
                } else if (text[currentPos] === '{') {
                    // Unexpected brace, treat as content or error
                    // For robustness, just ignore or treat as nested if we were inside a value (but we are not)
                }
                currentPos++;
                continue;
            }

            const fieldName = fieldMatch[1].toLowerCase();
            currentPos += fieldMatch[0].length;

            // Parse value
            let value = '';
            if (text[currentPos] === '{') {
                // Value enclosed in braces
                let valueBraceCount = 1;
                currentPos++; // Skip opening brace
                const valueStart = currentPos;

                while (valueBraceCount > 0 && currentPos < text.length) {
                    if (text[currentPos] === '{') valueBraceCount++;
                    else if (text[currentPos] === '}') valueBraceCount--;
                    currentPos++;
                }

                // Extract content (excluding the last closing brace)
                value = text.substring(valueStart, currentPos - 1);
            } else if (text[currentPos] === '"') {
                // Value enclosed in quotes
                currentPos++; // Skip opening quote
                const valueStart = currentPos;
                while (text[currentPos] !== '"' && currentPos < text.length) {
                    // Handle escaped quotes if necessary (simple BibTeX usually doesn't have them)
                    currentPos++;
                }
                value = text.substring(valueStart, currentPos);
                currentPos++; // Skip closing quote
            } else {
                // Value is a number or string
                const valueMatch = text.substring(currentPos).match(/^[^,}\s]+/);
                if (valueMatch) {
                    value = valueMatch[0];
                    currentPos += value.length;
                }
            }

            // Clean up value
            // Remove newlines and extra spaces
            value = value.replace(/\s+/g, ' ').trim();
            // Remove remaining braces used for formatting, but keep them if they were part of the structure?
            // The previous regex replace(/[{}]/g, '') was too aggressive if we want to keep some structure,
            // but for standard fields it's usually fine.
            value = value.replace(/[{}]/g, '');

            entry[fieldName] = value;

            // Skip comma after field
            const nextComma = text.indexOf(',', currentPos);
            const nextClose = text.indexOf('}', currentPos);

            if (nextComma !== -1 && (nextClose === -1 || nextComma < nextClose)) {
                currentPos = nextComma + 1;
            }
        }

        entries.push(entry);
        pos = currentPos;
    }

    return entries;
}

function renderPreprints(preprints) {
    const container = document.getElementById('preprints-container');
    if (!container) return;

    container.innerHTML = preprints.map(paper => createPublicationHTML(paper)).join('');
}

function renderPapersByYear(papersByYear) {
    const container = document.getElementById('publications-container');
    if (!container) return;

    // Sort years in descending order
    const years = Object.keys(papersByYear).sort((a, b) => b - a);

    container.innerHTML = years.map(year => `
        <div class="year-section" style="margin-bottom: 2rem;">
            <h3 style="font-size: 1.2rem; margin-bottom: 1rem; color: #333;">${year}</h3>
            ${papersByYear[year].map(paper => createPublicationHTML(paper)).join('')}
        </div>
    `).join('');
}

function renderWorkshops(workshops) {
    const container = document.getElementById('workshops-container');
    if (!container) return;

    container.innerHTML = workshops.map(paper => createPublicationHTML(paper)).join('');
}

function createPublicationHTML(paper) {
    const links = [];

    if (paper.arxiv) links.push(`<a href="${paper.arxiv}">arXiv</a>`);
    if (paper.pdf) links.push(`<a href="${paper.pdf}">pdf</a>`);
    if (paper.code) links.push(`<a href="${paper.code}">code</a>`);
    if (paper.poster) {
        // Use the exact path provided in the BibTeX entry
        links.push(`<a href="${paper.poster}">poster</a>`);
    }
    if (paper.video) links.push(`<a href="${paper.video}">talk</a>`);

    // Format authors: "A, B, and C"
    let authorText = paper.author || '';
    const authors = authorText.split(/\s+and\s+/).map(a => {
        a = a.trim();
        // Check if name is in "Last, First" format
        if (a.includes(',')) {
            const parts = a.split(',').map(p => p.trim());
            if (parts.length === 2) {
                return `${parts[1]} ${parts[0]}`;
            }
        }
        return a;
    });

    if (authors.length > 1) {
        const lastAuthor = authors.pop();
        authorText = authors.join(', ') + ' and ' + lastAuthor;
    } else if (authors.length === 1) {
        authorText = authors[0];
    }

    // Clean conference/venue: remove trailing comma
    let venue = paper.conference || 'Conference';
    if (venue.endsWith(',')) {
        venue = venue.slice(0, -1);
    }

    return `
        <div class="publication-item">
            <span class="publication-title">${paper.title}</span>
            <div class="publication-authors">${authorText}</div>
            <div class="publication-meta">${venue}</div>
            ${links.length > 0 ? `<div class="publication-links">${links.join('')}</div>` : ''}
        </div>
    `;
}

// Load publications when page loads
document.addEventListener('DOMContentLoaded', loadPublications);
