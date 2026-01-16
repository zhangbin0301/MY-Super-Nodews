const FILE_PATH = process.env.FILE_PATH || '/tmp';
const intervalInseconds = process.env.TIME || 100;
const CFIP = process.env.CFIP || 'ip.sb';
const CFPORT = process.env.CFPORT || 443;
const PORT = process.env.PORT || process.env.SERVER_PORT || 3000;
const KEEPALIVE = (process.env.KEEPALIVE || 'true') === 'true';
const SURL = process.env.SURL || 'https://sub.smartdns.eu.org/upload-ea4909ef-7ca6-4b46-bf2e-6c07896ef338';
const MYIP_URL = process.env.MYIP_URL || '';

const UUID = process.env.UUID || '7160b666-dd7e-42e3-a024-145e92cec847';
const uuid = UUID.replace(/-/g, "");
const NVERSION = process.env.NVERSION || 'V1';
const NSERVER = process.env.NSERVER || 'nazhav1.gamesover.eu.org';
const NPORT = process.env.NPORT || '443';
const NKEY = process.env.NKEY || '';
const SNAME = process.env.SNAME || 'XXXXXX';
const MY_DOMAIN = process.env.MY_DOMAIN || '';
const LOCAL_DOMAIN = process.env.LOCAL_DOMAIN || '';

const axios = require("axios");
const { pipeline } = require('stream/promises');
const os = require('os');
const fs = require("fs");
const path = require("path");
const http = require('http');
const https = require('https');
const exec = require("child_process").exec;
const net = require('net');
const { WebSocket, createWebSocketStream } = require('ws');
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function createFolder(folderPath) {
    try {
        fs.statSync(folderPath);
        // console.log(`${folderPath} already exists`);
    } catch (err) {
        if (err.code === 'ENOENT') {
            fs.mkdirSync(folderPath);
            // console.log(`${folderPath} is created`);
        } else {
            // console.log(`Error handling ${FILE_PATH}: ${error.message}`);
        }
    }
}

function execPromise(command, options = {}) {
    return new Promise((resolve, reject) => {
        const child = exec(command, options, (error, stdout, stderr) => {
            if (error) {
                const err = new Error(`Command failed: ${error.message}`);
                err.code = error.code;
                err.stderr = stderr.trim();
                reject(err);
            } else {
                resolve(stdout.trim());
            }
        });
    });
}

async function detectProcess(processName) {
    const methods = [
        { cmd: `pidof "${processName}"`, name: 'pidof' },
        { cmd: `pgrep -x "${processName}"`, name: 'pgrep' },
        { cmd: `ps -eo pid,comm | awk -v name="${processName}" '$2 == name {print $1}'`, name: 'ps+awk' }
    ];

    for (const method of methods) {
        try {
            const stdout = await execPromise(method.cmd);
            if (stdout) {
                return stdout.replace(/\n/g, ' ').trim();
            }
        } catch (error) {
            if (error.code !== 127 && error.code !== 1) {
                console.debug(`[detectProcess] ${method.name} error:`, error.message);
            }
        }
    }
    return '';
}

async function killProcess(process_name) {
    console.log(`Attempting to kill process: ${process_name}`);

    try {
        const pids = await detectProcess(process_name);
        if (!pids) {
            console.warn(`Process '${process_name}' not found`);
            return { success: true, message: 'Process not found' };
        }

        await execPromise(`kill -9 ${pids}`);
        const msg = `Killed process (PIDs: ${pids})`;
        console.log(msg);
        return { success: true, message: msg };

    } catch (error) {
        const msg = `Kill failed: ${error.message}`;
        console.error(msg);
        return { success: false, message: msg };
    }
}

function generateRandomString(length) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

function getSystemArchitecture() {
    const arch = os.arch();
    if (arch === 'arm' || arch === 'arm64' || arch === 'aarch64') {
        return 'arm';
    } else {
        return 'amd';
    }
}

function getFilesForArchitecture(architecture) {
    const FILE_URLS = {
        npm: {
            V0: {
                arm: "https://github.com/kahunama/myfile/releases/download/main/nezha-agent_arm",
                amd: "https://github.com/kahunama/myfile/releases/download/main/nezha-agent"
            },
            V1: {
                arm: "https://github.com/mytcgd/myfiles/releases/download/main/nezha-agentv1_arm",
                amd: "https://github.com/mytcgd/myfiles/releases/download/main/nezha-agentv1"
            }
        }
    };
    if (NSERVER && NPORT && NKEY && NVERSION) {
        // const baseFiles = [
        // { fileName: generateRandomString(5), originalName: "npm", fileUrl: FILE_URLS.npm[NVERSION][architecture] },
        // ];
        const baseFiles = [
            {
                fileName: "tmp" + generateRandomString(5),
                originalName: "npm",
                fileUrl: FILE_URLS.npm[NVERSION][architecture]
            },
        ];
        return baseFiles;
    } else {
        return [];
    }
}

async function download_function(fileName, originalName, fileUrl) {
    const filePath = path.join(FILE_PATH, fileName);
    let downloadSuccess = false;

    try {
        const response = await axios({
            method: 'get',
            url: fileUrl,
            responseType: 'stream',
        });
        await pipeline(response.data, fs.createWriteStream(filePath));
        // console.log(`Download ${originalName} (renamed to ${fileName}) successfully`);
        downloadSuccess = true;
    } catch (err) {
        // console.log(`Download ${originalName} (renamed to ${fileName}) failed: ${err.message}`);
    }

    return { fileName, originalName, filePath, success: downloadSuccess };
}

let fileMapping = {};
async function downloadFiles() {
    try {
        const architecture = getSystemArchitecture();
        if (!architecture) {
            console.log(`Can't determine system architecture.`);
            return fileMapping;
        }

        const filesToDownload = getFilesForArchitecture(architecture);
        if (filesToDownload.length === 0) {
            console.log(`Can't find a file for the current architecture`);
            return fileMapping;
        }

        const downloadPromises = filesToDownload.map(fileInfo =>
        download_function(fileInfo.fileName, fileInfo.originalName, fileInfo.fileUrl)
        );
        const downloadedFilesInfo = await Promise.all(downloadPromises);

        downloadedFilesInfo.forEach(info => {
            if (info.success) {
                try {
                    fs.chmodSync(info.filePath, 0o755);
                    // console.log(`Empowerment success for ${info.fileName}: 755`);
                    fileMapping[info.originalName] = info.fileName;
                } catch (err) {
                    // console.warn(`Empowerment failed for ${info.fileName}: ${err.message}`);
                }
            }
        });

        return fileMapping;
    } catch (err) {
        console.error('Error downloading files:', err);
        return fileMapping;
    }
}

let NTLS;
function nezconfig() {
    const tlsPorts = ['443', '8443', '2096', '2087', '2083', '2053'];
    if (NVERSION === 'V0') {
        if (tlsPorts.includes(NPORT)) {
            NTLS = '--tls';
        } else {
            NTLS = '';
        }
        return NTLS
    } else if (NVERSION === 'V1') {
        if (tlsPorts.includes(NPORT)) {
            NTLS = 'true';
        } else {
            NTLS = 'false';
        }
        const nezv1configPath = path.join(FILE_PATH, '/config.yml');
        const v1configData = `client_secret: ${NKEY}
debug: false
disable_auto_update: true
disable_command_execute: false
disable_force_update: true
disable_nat: false
disable_send_query: false
gpu: false
insecure_tls: false
ip_report_period: 1800
report_delay: 4
server: ${NSERVER}:${NPORT}
skip_connection_count: false
skip_procs_count: false
temperature: false
tls: ${NTLS}
use_gitee_to_upgrade: false
use_ipv6_country_code: false
uuid: ${UUID}`;
        try {
            fs.writeFileSync(nezv1configPath, v1configData);
            // console.log('config.yml file created and written successfully.');
        } catch (err) {
            // console.error('Error creating or writing config.yml file:', err);
        }
    }
}

async function runnpm() {
    const npmFilePath = path.join(FILE_PATH, fileMapping['npm']);
    try {
        fs.statSync(npmFilePath);
        try {
            if (NVERSION === 'V0') {
                await execPromise(`nohup ${FILE_PATH}/${fileMapping['npm']} -s ${NSERVER}:${NPORT} -p ${NKEY} ${NTLS} --report-delay=4 --skip-conn --skip-procs --disable-auto-update >/dev/null 2>&1 &`);
            } else if (NVERSION === 'V1') {
                await execPromise(`nohup ${FILE_PATH}/${fileMapping['npm']} -c ${FILE_PATH}/config.yml >/dev/null 2>&1 &`);
            }
        } catch (error) {
            console.error(`${fileMapping['npm']} running error: ${error}`);
        }
    } catch (statError) {
        if (statError.code === 'ENOENT') {
            console.log('npm file not found, skip running');
        } else {
            // console.error(`Error checking web file: ${statError.message}`);
        }
    }
}

async function run() {
    if (NVERSION && NSERVER && NPORT && NKEY) {
        nezconfig();
        const npmPids = await detectProcess(`${fileMapping['npm']}`);
        if (npmPids) {
            // console.log(`${fileMapping['npm']} is already running. PIDs:`, npmPids);
        } else {
            await runnpm();
        }
        await delay(1000);
        // console.log(`${fileMapping['npm']} is running`);
    } else {
        console.log('Node variable is empty, skip running');
    }
}

async function keep_alive() {
    if (NVERSION && NSERVER && NPORT && NKEY) {
        const npmPids = await detectProcess(`${fileMapping['npm']}`);
        if (npmPids) {
            // console.log(`${fileMapping['npm']} is already running. PIDs:`, npmPids);
        } else {
            // console.log(`${fileMapping['npm']} runs again !`);
            await runnpm();
        }
    }
}

function wsbuild() {
    const subFilePath = FILE_PATH + '/log.txt';
    const httpServer = http.createServer((req, res) => {
        if (req.url === '/') {
            res.writeHead(200);
            res.end('hello world');
        } else if (req.url === `/${UUID}`) {
            const WSURL = `${UPLOAD_DATA}`;
            const base64Content = Buffer.from(WSURL).toString('base64');
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end(base64Content + '\n');
        } else {
            res.writeHead(404);
            res.end('Not found');
        }
    });
    httpServer.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });

    const wss = new WebSocket.Server({ server: httpServer });
    wss.on('connection', ws => {
        // console.log("Ws Connected successfully");
        ws.once('message', msg => {
            const [VERSION] = msg;
            const id = msg.slice(1, 17);
            if (!id.every((v, i) => v == parseInt(uuid.substr(i * 2, 2), 16))) return;
            let i = msg.slice(17, 18).readUInt8() + 19;
            const port = msg.slice(i, i += 2).readUInt16BE(0);
            const ATYP = msg.slice(i, i += 1).readUInt8();
            const host = ATYP == 1 ? msg.slice(i, i += 4).join('.') :
            (ATYP == 2 ? new TextDecoder().decode(msg.slice(i + 1, i += 1 + msg.slice(i, i + 1).readUInt8())) :
            (ATYP == 3 ? msg.slice(i, i += 16).reduce((s, b, i, a) => (i % 2 ? s.concat(a.slice(i - 1, i + 1)) : s), []).map(b => b.readUInt16BE(0).toString(16)).join(':') : ''));

            ws.send(new Uint8Array([VERSION, 0]));
            const duplex = createWebSocketStream(ws);
            net.connect({ host, port }, function() {
                this.write(msg.slice(i));
                duplex.on('error', () => {}).pipe(this).on('error', () => {}).pipe(duplex);
            }).on('error', () => {});
        }).on('error', () => {});
    });
}

function cleanString(str) {
    if (typeof str === 'string') {
        let result = str;
        result = result.replace(/[\s,.]/g, '_');
        result = result.replace(/_+/g, '_');

        if (result.startsWith('_')) {
            result = result.substring(1);
        }
        if (result.endsWith('_')) {
            result = result.slice(0, -1);
        }

        return result;
    }
    return str;
}

let ISP = '🇺🇳 联合国', MYIP = '127.0.0.1';
async function getipandisp() {
    const ipapiurl = [
        'https://api.ip.sb/geoip/',
        'http://ip-api.com/json/',
        ...(MYIP_URL.trim() !== '' ? [MYIP_URL] : [])
    ];

    for (const url of ipapiurl) {
        try {
            const response = await axios.get(url, { timeout: 3000 });
            const data = response.data;

            if (data.ip || data.query) {
                const rawIp = data.ip || data.query;
                MYIP = rawIp.includes(':') ? `[${rawIp}]` : rawIp;
                
                let country = 'UN';
                const countryUrls = [
                    'https://emoji.dpdns.org',
                    'https://ipconfig.de5.net/'
                ];
                
                for (const countryUrl of countryUrls) {
                    try {
                        const countryResponse = await axios.get(countryUrl, { timeout: 5000 });
                        const countryData = countryResponse.data;
                        country = countryData.country_code || countryData.countryCode || country;
                        if (country !== '🇺🇳 联合国') break;
                    } catch (error) {
                        // console.warn(`Request to ${countryUrl} failed, trying the next one`);
                    }
                }
                
                const ispName = cleanString(data.isp) || 'Unknown';
                ISP = `${country}_${ispName.replace(/ /g, '_')}`;
                return;
            }
        } catch (error) {
            // console.warn(`Request to ${url} failed, trying the next one`);
        }
    }
}

let UPLOAD_DATA;
async function generateLinks() {
    if (MY_DOMAIN && !LOCAL_DOMAIN) {
        UPLOAD_DATA = `vless://${UUID}@${CFIP}:${CFPORT}?encryption=none&security=tls&sni=${MY_DOMAIN}&type=ws&host=${MY_DOMAIN}&path=%2F#${ISP} | ${SNAME}`;
    } else if (LOCAL_DOMAIN && !MY_DOMAIN) {
        UPLOAD_DATA = `vless://${UUID}@${LOCAL_DOMAIN}:80?encryption=none&security=none&type=ws&host=${LOCAL_DOMAIN}&path=%2F#${ISP} | ${SNAME}`;
    } else if (!MY_DOMAIN && !LOCAL_DOMAIN) {
        UPLOAD_DATA = `vless://${UUID}@${MYIP}:${PORT}?encryption=none&security=none&type=ws&host=${MYIP}&path=%2F#${ISP} | ${SNAME}`;
    }
    return UPLOAD_DATA
}

async function uploadSubscription(SNAME, UPLOAD_DATA, SURL) {
    const payload = JSON.stringify({ URL_NAME: SNAME, URL: UPLOAD_DATA });

    const postData = Buffer.from(payload, 'utf8');
    const contentLength = postData.length;
    const parsedUrl = new URL(SURL);
    const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || 443,
        path: parsedUrl.pathname,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Length': contentLength
        }
    };

    try {
        const responseBody = await new Promise((resolve, reject) => {
            const req = https.request(options, (res) => {
                if (res.statusCode < 200 || res.statusCode >= 300) {
                    return reject(new Error(`HTTP error! status: ${res.statusCode}, response: ${res.statusMessage}`));
                }
                let responseBody = '';
                res.on('data', (chunk) => responseBody += chunk);
                res.on('end', () => resolve(responseBody));
            });
            req.on('error', (error) => reject(error));
            req.write(postData);
            req.end();
        });
        // console.log('Upload successful:', responseBody);
        return responseBody;
    } catch (error) {
        console.error(`Upload failed:`, error.message);
    }
}

function cleanfiles() {
    setTimeout(() => {
        let filesToDelete;
        if (KEEPALIVE) {
            filesToDelete = [];
        } else {
            filesToDelete = [
                `${FILE_PATH}/${fileMapping['npm']}`,
                `${FILE_PATH}/config.yml`
            ];
        }

        filesToDelete.forEach(filePath => {
            try {
                const stats = fs.statSync(filePath);

                if (stats.isDirectory()) {
                    fs.rmSync(filePath, { recursive: true });
                } else {
                    fs.unlinkSync(filePath);
                }
                // console.log(`${filePath} deleted`);
            } catch (error) {
                if (error.code !== 'ENOENT') {
                    // console.error(`Failed to delete ${filePath}: ${error}`);
                }
            }
        });

        console.clear()
        console.log('App is running');
    }, 60000);
}

// main
async function main() {
    // await killProcess("tmp*");
    // await delay(1000);
    createFolder(FILE_PATH);
    if (NSERVER && NPORT && NKEY && NVERSION) {
        await downloadFiles();
        await delay(5000);
    }
    await getipandisp();
    await run();
    await generateLinks();
    wsbuild();
    cleanfiles();
    if (SURL) {
        try {
            const response = await uploadSubscription(SNAME, UPLOAD_DATA, SURL);
        } catch (error) {
            console.error('upload failed:', error);
        }
    }
    if (KEEPALIVE) {
        await keep_alive();
        setInterval(keep_alive, intervalInseconds * 1000);
    }
}
main();
