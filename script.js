document.addEventListener("DOMContentLoaded", (event) => {
    const textArea = document.querySelector("textarea");
    const form = document.querySelector("form");
    const parsedContainer = document.querySelector(".parsed");
    const previewContainer = document.querySelector(".preview");

    /**
     * Escapes HTML special characters to prevent XSS.
     * @param {string} str - The input string to escape.
     * @returns {string} - The escaped string.
    */
    function escapeHTML(str) {
        return str.replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
    }
    
    /**
     * Unescapes HTML special characters.
     * @param {string} str - The escaped string to unescape.
     * @returns {string} - The unescaped string.
    */
    function unescapeHTML(str) {
        const tempElement = document.createElement("div");
        tempElement.innerHTML = str;
        return tempElement.textContent || tempElement.innerText || "";
    }
    
    /**
     * Parses Markdown formatting into HTML.
     * Supports bold (**), italic (*), underline (__), strikethrough (~~), and inline code (`).
     * @param {string} line - The Markdown-formatted line.
     * @returns {string} - The HTML-formatted line.
    */
    function parseMarkdown(line) {
        const formats = [
            { delimiter: "**", tag: "strong", flag: false },
            { delimiter: "*", tag: "em", flag: false },
            { delimiter: "~~", tag: "del", flag: false },
            { delimiter: "__", tag: "u", flag: false },
            { delimiter: "`", tag: "code", flag: false },
        ];

        let result = "";
        let buffer = "";
        let activeFormat = null;

        for (let i = 0; i < line.length; ++i) {
            const twoChar = line[i] + (line[i + 1] || "");
            const oneChar = line[i];

            let format = formats.find(f => f.delimiter === twoChar);
            if (format) {
                if (activeFormat === format) {
                    result += `<${format.tag}>${buffer}</${format.tag}>`;
                    buffer = "";
                    activeFormat = null;
                } else {
                    result += buffer;
                    buffer = "";
                    activeFormat = format;
                }
                i++; 
                continue;
            }

            format = formats.find(f => f.delimiter === oneChar);
            if (format) {
                if (activeFormat === format) {
                    result += `<${format.tag}>${buffer}</${format.tag}>`;
                    buffer = "";
                    activeFormat = null;
                } else {
                    result += buffer;
                    buffer = "";
                    activeFormat = format;
                }
                continue;
            }

            buffer += line[i];
        }

        result += buffer;
        return result;
    }
    
    /**
     * Converts Markdown links into HTML anchor tags.
     * @param {string} line - The line containing Markdown links.
     * @returns {string} - The line with converted HTML links.
    */
    function checkAHref(line) {
        let result = "";
        let buffer = "";
        let isLinkText = false;
        let isLinkUrl = false;
        let linkText = "";
        let linkUrl = "";

        for (let i = 0; i < line.length; i++) {
            const char = line[i];

            if (char === "[" && !isLinkText && !isLinkUrl) {
                if (buffer) {
                    result += buffer; 
                    buffer = "";
                }
                isLinkText = true; 
                continue;
            }

            if (char === "]" && isLinkText && !isLinkUrl) {
                isLinkText = false; 
                if (line[i + 1] === "(") {
                    isLinkUrl = true; 
                    i++; 
                } else {
                    result += `[${linkText}]`; 
                    linkText = "";
                }
                continue;
            }

            if (char === ")" && isLinkUrl) {
                isLinkUrl = false; 
                result += `<a href="${escapeHTML(linkUrl)}">${escapeHTML(linkText)}</a>`;
                linkText = "";
                linkUrl = "";
                continue;
            }

            if (isLinkText) {
                linkText += char; 
            } else if (isLinkUrl) {
                linkUrl += char; 
            } else {
                buffer += char; 
            }
        }

        result += buffer; 
        return result;
    }

    /**
     * Handles form submission to parse the Markdown content into HTML.
     * @param {Event} e - The form submission event.
    */
    form.addEventListener("submit", e => {
        e.preventDefault();
        const val = textArea.value;
        const lines = val.split('\n');
        
        let html = ``;
        let isCodeBlock = false;
        let codeBlockBuffer = "";

        let ulFlag = false; 
        let ulBuffer = "";  

        for (let i = 0; i < lines.length; ++i) {
            if (lines[i] === " *") {
                if (ulFlag) {
                    html += `${escapeHTML(`<ul>${ulBuffer}</ul>`)}<br/>`
                    ulBuffer = "";
                }
                ulFlag = !ulFlag; 
                continue;
            }

            if (ulFlag) {
                ulBuffer += `<li>${parseMarkdown(lines[i])}</li>`;
                continue;
            }

            let line = lines[i].trim();

            // remove spaces
            if (line === "") {
                continue;
            }

            // code block
            if (line.startsWith("```")) {
                if (isCodeBlock) {
                    html += `${escapeHTML(`<pre><code>${codeBlockBuffer}</code></pre>`)}<br/>`
                    codeBlockBuffer = "";
                }
                isCodeBlock = !isCodeBlock;
                continue;
            }

            if (isCodeBlock) {
                codeBlockBuffer += (codeBlockBuffer ? "\n" : "") + line;
                continue;
            }

            line = parseMarkdown(line);
            line = checkAHref(line);

            // headings
            let level = 0;
            while (level < line.length && line[level] === "#") {
                level++;
            }

            if (level >= 1 && level <= 6 && line[level] === " ") {
                const content = line.slice(level + 1).trim();
                html += `${escapeHTML(`<h${level}>${content}</h${level}>`)}<br/>`;
                continue;
            }

            // paragraph
            if (line && line[0] && line[0].match(/^[0-9a-zA-Z]+$/)) {
                html += `${escapeHTML(`<p>${line}<p>`)}<br/>`;
                continue;
            }

            // blockquote
            if (line.startsWith(">") && line[1] === " ") {
                const content = line.slice(2);
                html += `${escapeHTML(`<blockquote>${content}</blockquote>`)}<br/>`;
                continue;
            }

            // img tag
            if (line.startsWith("!")) {
                let altText = "";
                let imageSource = "";

                if (line[1] === "[" && line.includes("]") && line.includes("(") && line.includes(")")) {
                    altText = line.substring(line.indexOf("[") + 1, line.lastIndexOf("]"));
                    imageSource = line.substring(line.indexOf("(") + 1, line.lastIndexOf(")"));
                } else if (line[1] === "(" && line.includes(")")) {
                    imageSource = line.substring(line.indexOf("(") + 1, line.lastIndexOf(")"));
                }

                if (imageSource) {
                    html += `${escapeHTML(`<img src="${imageSource}" ${altText ? `alt="${altText}"` : ""} />`)}<br/>`;
                    continue;
                }
            }
        }
        if (html !== undefined) {
            parsedContainer.innerHTML = html;
            previewContainer.innerHTML = unescapeHTML(html);
        }
    });
});
