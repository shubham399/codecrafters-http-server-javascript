const net = require('net');
const fs = require('fs');
const zlib = require('zlib');


class HTTPResponse {
    constructor(status_code, body = null, headers = null) {
        this.status_code = status_code;
        this.status_code_message = {
            200: "OK",
            404: "Not Found",
            201: "Created"
        }[status_code];
        this.body = body;
        this.headers = headers || {};
    }

    get status_line() {
        return `HTTP/1.1 ${this.status_code} ${this.status_code_message}`;
    }

    get headers_section() {
        return Object.entries({
            "Content-Length": this.body ? this.body.length : 0,
            ...this.headers
        }).map(([key, value]) => `${key}: ${value}`).join('\r\n');
    }

    toString() {
        const statusBuffer = Buffer.from(`${this.status_line}\r\n`);
        const headersBuffer = Buffer.from(`${this.headers_section}\r\n\r\n`);
        const response = Buffer.concat([statusBuffer, headersBuffer, this.body || Buffer.from('')]);
        return  response
        }
    // toString() {
    //     return `${this.status_line}\r\n${this.headers_section}\r\n\r\n${this.body || ''}`;
    // }
}

class HTTPRequest {
    constructor(raw_contents) {
        this.raw_contents = raw_contents;
    }

    get headers() {
        return this.headers_section.split('\r\n').reduce((acc, line) => {
            const [key, value] = line.split(': ');
            acc[key] = value;
            return acc;
        }, {});
    }

    get method() {
        return this.status_line.split(' ')[0];
    }

    get path() {
        return this.status_line.split(' ')[1];
    }

    get protocol() {
        return this.status_line.split(' ')[2];
    }

    get status_line() {
        return this.raw_contents.split('\r\n')[0];
    }

    get headers_section() {
        return this.raw_contents.split('\r\n').slice(1).join('\r\n');
    }

    get body() {
        return this.raw_contents.split('\r\n\r\n')[1];
    }

    toString() {
        return `<HTTPRequest ${this.method} ${this.path}>`;
    }
}

function handle_connection(conn, data_directory) {
    conn.on('data', (data) => {
        const request = new HTTPRequest(data.toString());
        console.log(request.toString());

        if (request.path === "/") {
            conn.write(new HTTPResponse(200).toString());
        } else if (request.path.startsWith("/echo")) {
            const value = request.path.split("/echo/")[1];
            const accepted_encoding = (request.headers["Accept-Encoding"] || "").toLowerCase();
            console.log(accepted_encoding, accepted_encoding.includes("gzip"));

            if (accepted_encoding.includes("gzip")) {
                const gzipData = zlib.gzipSync(Buffer.from(value)); // Convert value to Buffer
                console.log(gzipData.toString('hex')); // Log the compressed data as bytes
                const decompressedData = zlib.gunzipSync(gzipData);
                // Decode the decompressed data (assuming UTF-8 encoding)
                const originalString = decompressedData.toString('utf-8');
                console.log(originalString);
                const response = new HTTPResponse(200, gzipData, {
                    "Content-Type": "text/plain",
                    "Content-Encoding": "gzip"
                });
                conn.write(response.toString());
            } else {
                const response = new HTTPResponse(200, Buffer.from(value, 'utf-8'), {
                    "Content-Type": "text/plain"
                });
                conn.write(response.toString());
            }
        } else if (request.path === "/user-agent") {
            const response = new HTTPResponse(200, Buffer.from(request.headers["User-Agent"]), {
                "Content-Type": "text/plain"
            });
            conn.write(response.toString());
        } else if (request.path.startsWith("/files/")) {
            if (request.method === "GET") {
                const filename = request.path.split("/files/")[1];
                const file_path = `${data_directory}/${filename}`;
                console.debug("🚀  file: main.js:114  conn.on  file_path:", file_path);
                if (fs.existsSync(file_path)) {
                    const body = fs.readFileSync(file_path);
                    const response = new HTTPResponse(200, body, {
                        "Content-Type": "application/octet-stream"
                    });
                    conn.write(response.toString());
                } else {
                    conn.write(new HTTPResponse(404).toString());
                }
            } else if (request.method === "POST") {
                const filename = request.path.split("/files/")[1];
                const file_path = `${data_directory}/${filename}`;

                fs.writeFileSync(file_path, request.body);

                conn.write(new HTTPResponse(201).toString());
            } else {
                conn.write(new HTTPResponse(404).toString());
            }
        } else {
            conn.write(new HTTPResponse(404).toString());
        }
    });
}

function main() {

    console.log(process.argv)
    const server = net.createServer((conn) => {
        console.log('Client connected', conn.remoteAddress, conn.remotePort);
        // Get directory --directory <directory> and use that as data directory
        // TODO: Make this better
        const data_directory = process.argv[3] || process.cwd()
        handle_connection(conn, data_directory);
    });

    server.listen(4221, 'localhost', () => {
        console.log('Server listening on port 4221');
    });
}

main();
