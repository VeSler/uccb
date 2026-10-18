//import path = require("node:path");

/** @file  */
const {SerialPort} = require("serialport");
const EventEmitter = require("events");
const {ReadlineParser} = require("@serialport/parser-readline");
const keyPortId = "CAN_USB_ConverterBasic";

type tCanBaudRate = '100k' | '125k' | '250k' | '500k' | '800k' | '1M' | null;
type tCanBaudRateCmd = 'S3' | 'S4' | 'S5' | 'S6' | 'S7' | 'S8' | null;
type tBaudRate = 9600 | 19200 | 38400 | 57600 | 115200 | null;
type tCanMode = 'O' | 'L' | 'l' | null;
const canBaudRateCmdMap: Record<Exclude<tCanBaudRate, null>, tCanBaudRateCmd> = {
    '100k': 'S3',
    '125k': 'S4',
    '250k': 'S5',
    '500k': 'S6',
    '800k': 'S7',
    '1M': 'S8'
};

interface iPort{
    path: string | undefined,
    manufacturer: string | undefined,
    serialNumber: string | undefined,
    pnpId: string | undefined,
    locationId: string | undefined,
    vendorId: string | undefined,
    productId: string | undefined
};

interface iCanMessage {
    id: number;
    data: Number[];
    isExtended: boolean;
    isRemote: boolean;
    timestamp: number;
    length?: number;
}

module.exports = class UCCB extends EventEmitter {
    connection: typeof SerialPort | null = null;
    spParser: typeof ReadlineParser | null = null;
    portName: string | null = null;
    canBaudRate: tCanBaudRate = null;
    canMode: tCanMode = null;
    firmWare: string | null = null;
    hardWare: string | null = null;
    serialNumber: string | null = null;
    queue: string[] = [];

    constructor() {
        super();
        this.canBaudRate = "125k";
    };

    setCanBaudRate(baudRate: tCanBaudRate) {
        this.canBaudRate = baudRate;
    };

    getPortList() {
        return SerialPort.list();
    };

    setPortName(portName: string) {
        this.portName = portName;
    };

    findPortNameByPnpId(value: string):string | null {
        return SerialPort.list().then((ports: iPort[]) => {
            const port = ports.find((p) => p.pnpId?.includes(value));
            return port ? port.path : null;
        });
    };

    async start(mode: tCanMode, options = {}) {
        let _mode = mode || "O";
        if(!["O", "L", "l"].includes(_mode)) {
            throw new Error(`Invalid mode: ${_mode}. Valid modes are 'O', 'L', or 'l'.`);
        };
        if (!this.portName){
            this.portName = this.findPortNameByPnpId(keyPortId);
        }
        await this.openPort(this.portName, options);
        await this.getInfo();
        await this.canOpen(_mode);
    };

    async stop() {
        await this.canClose();
        await this.closePort();
    }

    async getInfo() {
        return new Promise<void>((resolve, reject) => {
            if (!this.connection) {
                reject("No active connection.");
            }
            try {
                this.connection.write("V\r");
                this.connection.drain();
                this.connection.write("v\r");
                this.connection.drain();
                this.connection.write("N\r");
                this.connection.drain();
                this.connection.write("F\r");
                this.connection.drain();
                resolve();
            }  
            catch (error) {
                reject(`Error getting info: ${error}`);
            };
        });
    };

    printInfo() {
        console.log(`Firmware: ${this.firmWare}`);
        console.log(`Hardware: ${this.hardWare}`);
        console.log(`Serial Number: ${this.serialNumber}`);
    };
    
    async openPort(portName: string | null, options = {}) {
        return new Promise<void>((resolve, reject) => {
            if (!portName) {
              reject("Port name is not specified.");
            };
            this.connection = new SerialPort({path: this.portName, baudRate: 115200, autoOpen: true,}, (err: Error | null) => {
                if (err) {
                    reject(`Error opening port: ${err.message}`);
                }else {
                    this.spParser = this.connection.pipe(new ReadlineParser({ delimiter: '\r' }));
                    this.spParser.on('data', (data: string) => {this.onData(data)});
                    this.emit("portOpened", 'Port opened successfully');
                    resolve();
                }
            });

        });
    };

    async closePort() {
        return new Promise<void>((resolve, reject) => {
            if (this.connection) {
                this.connection.close((err: Error | null) => {
                    if (err) {
                        reject(`Error closing port: ${err.message}`);
                    } else {
                        this.connection = null;
                        this.emit("portClosed", 'Port closed successfully');
                        resolve();
                    }
                });
            } else {
                resolve();
            }
        });
    };

    async canOpen(mode: tCanMode) {
        return new Promise<void>((resolve, reject) => {
            if (!this.connection) {
                reject("No active connection.");
            }
            // ToDo: Implement CAN open logic based on mode
            let _mode = mode || "O";
            let baudRateCmd = this.canBaudRate ? canBaudRateCmdMap[this.canBaudRate] : "S4";
            if(this.canMode || this.canMode != "C") {
                this.canClose();
            };
            this.connection.write(`${baudRateCmd}\r`);
            this.canMode = _mode;
            this.emit("canWorked", 'CAN_BUS started successfully');
            resolve();
        });
    };

    async canClose() {
        return new Promise<void>((resolve, reject) => {
            if (!this.connection) {
                reject("No active connection.");
            }
            while(this.queue.length > 0) {
                            }
            this.connection.write("C\r");
            this.canMode = null;
            this.emit("canStopped", 'CAN_BUS stopped successfully');
            resolve();
        });
    };

    onData(data: string) {
        // залишено з попередньої версії

        try{
            data.replace(/\r|\n/g, '');
        }catch (e){
            this.emit('error', e)
        }

        if(data.length > 0){
            switch (data[0]) {
                case 't':
                case 'T':
                case 'r':
                case 'R':
                    this.parseCanMessage(data);
                    this.emit('data', data);
                    break;
                case 'v':
                    this.firmWare = data.substring(1);
                    break;
                case 'V':
                    this.hardWare = data.substring(1);
                    break;
                case 'N':
                    this.serialNumber = data.substring(1);
                    break;
                case 'F':
                    this.emit('status', data.substring(1));
                    break;
                case 'z':
                case 'Z':
                    this.emit('send', `Sending message: ${this.queue.shift()}`);
                    this.sendMessage();
                    break;
                default:
                    this.emit('unknownData', data);
            }
        }
    } 
    parseCanMessage(data: string) {
        let val: iCanMessage = {
            id: 0,
            data: [],
            isExtended: false,
            isRemote: false,
            timestamp: Date.now(),
            length: 0
        };

        let offset = 0;
        if (data[0] === 't' || data[0] === 'r') {
            val.isExtended = false;
            offset = 0;
        } else if (data[0] === 'T' || data[0] === 'R') {
            val.isExtended = true;
            offset = 5;
        } else {
            this.emit('error', new Error(`Invalid CAN message type: ${data[0]}`));
            return;
        }
        if (data[0] === 'r' || data[0] === 'R') {
            val.isRemote = true;
            val.id = parseInt(data.substring(1, 4 + offset), 16);
            val.length = parseInt(data.substring(4 + offset, 5 + offset), 16);
        }else if (data[0] === 't' || data[0] === 'T') {
            val.isRemote = false;
            val.id = parseInt(data.substring(1, 4 + offset), 16);
            val.length = parseInt(data.substring(4 + offset, 5 + offset), 16);
            for (let i = 0; i < val.length; i++) {
                let byteStr = data.substring(5 + offset + i * 2, 7 + offset + i * 2);
                val.data.push(parseInt(byteStr, 16));
            }
        }
        this.emit('canMessage', JSON.stringify(val));
    }; 
    
    sendMessage() {
        if (this.queue.length > 0 && this.connection) {
            const message = this.queue[0];
            this.connection.write(message + '\r');
        };
    };

    newMessage(message: string) {
        this.queue.push(message);
        if (this.queue.length === 1) {
            this.sendMessage();
        };
    };
};
