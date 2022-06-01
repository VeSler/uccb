/**
 * 0.1.0 - новая структура интерфейса
 * 
 * 0.0.1 - 
 * реализовано:
 * находим порт, подключаемся, активируем адаптер  (на 125)
 * 
 * connect()
 * disconnect();
 * 
 * open();
 * listen();
 * close();
 * 
 * 
 * TODO: обработать получение данных
 * 
 * setBaudRate()
 * 
 * версии прошивки ...
 * 
 * getHV
 * getFV
 * getSN
 * 
 * маски ...
 */

const { SerialPort } = require('serialport');
const EventEmitter = require('node:events');
const { ReadlineParser } = require('@serialport/parser-readline');
const { resolve } = require('node:path');

module.exports = class Uccb extends EventEmitter {

    portName;   // назва порту UART
    baudRate;
    mode;
    ld;

    sp;         // SerialPort 
    parser;     // serialport/parser-readline

    isConnected = false;
    isOpen = false;
    isPresentDevice = false;
    sendCMD;
    HV;
    SV;
    SN;

    baudRates = ['100k', '125k', '250k', '500k', '800k', '1M'];
    cmds = [
        { cmd: 'S3', br: '100k' },
        { cmd: 'S4', br: '125k' },
        { cmd: 'S5', br: '250k' },
        { cmd: 'S6', br: '500k' },
        { cmd: 'S7', br: '800k' },
        { cmd: 'S8', br: '1M' },
    ]

    constructor(baudRate) {
        //baudRate: '', '100k', '125k', '250k', '500k', '800k', '1M'
        super();
        this.baudRate = baudRate || '125k';
        if (!this.checkBaudRate(baudRate)) {
            throw new Error(`Incorrect value baudRate: ${this.baudRate}`)
        };
    }

    async start(mode) {
        //TODO: в проверке
        // - находим устройство (порт к нему) 
        // - подключаемся к порту
        // - открываем устройство с нужным mode
        try{
            await this.portInit();
            await this.portOpen();
            // перед открытием, получить версии HW, прошивки, серийный номер
            //TODO: проверить возвращаемое значение при отправке зпароса скопом: "V\rv\rN\r"
            //      в разной очередности 
//            await this.getDeviceInfo();
            await this.canOpen(); //default
            this.emit('canStart');
        }catch(e){
            throw e;
        }
    }

    async getDeviceInfo(){
        if (this.isOpen && !this.isConnected) throw new Error(`Can't get info from device. Port is closed or device is started`)

        await this.writeCMD('V');
        await this.writeCMD('v');
        await this.writeCMD('N');

    }

    async stop() {
        //TODO: в проверке
        // - закрываем устройство
        // - закрываем порт
        try{
            await this.canClose();
            await this.portClose();
            this.emit('canStop');
        }catch(e){
            throw(e);
        }
    }

    async portInit() {
        try{           
            let list = await this.getUARTList();
            list.forEach(item => {
                if (dev?.pnpId.includes("CAN_USB_ConverterBasic")) {
                    this.portName = item?.path;
                    return(item?.path);
                }
            })
            throw new Error(`Path not found. List devices: ${JSON.stringify(res)}`)
        }catch(e){
            throw e;
        }
    }

    async portOpen() {
        // открыть порт
        return new Promise((resolve, reject) => {
            this.sp = new SerialPort({ path: this.portName, baudRate: 115200, autoOpen: true }, (e) => {
                if (e) {
                    reject(e);
                } else {
                    this.isConnected = true;
                    this.emit('portOpen');
                }
            });
            this.parser = this.sp.pipe(new ReadlineParser({ delimiter: '\r' }))
            this.parser.on('data', (data) => { this.onData(data) });
            resolve('Port opened');
        })
    }

    async portClose() {
        // закрываем подключение к порту
        return new Promise((resolve, reject) => {
            if (!this.isConnected) resolve(`WARNING: Port has already been closed`);
            this.sp.close((e) => {
                if (e) {
                    reject(e)
                } else {
                    this.isConnected = false;
                    this.emit('portClose');
                    resolve('Port closed successfully')
                }
            });
        })
    }

    async canSetBaudRate(canBaudRate) {
        // установка скорости шины CAN
        try{
            canBaudRate = canBaudRate || 'S4';
            await this.writeStr(canBaudRate);    
        }catch (e){
            throw e;
        }
    }

    async canOpen() {
        try{
            await this.canSetBaudRate('S4')
            await this.writeStr('O')
            this.emit('canOpen');
        }catch (e){
            throw e;
        }
    }
    async canListen() {

    }
    async canLoopBack() {

    }
    async canClose() {
        try{
            await this.writeStr('C');
            this.emit('canClose');
        }catch (e){
            throw e;
        }

    }

    async getUARTList() {
        try {
            return await SerialPort.list();
        } catch (e){
            throw e;
        }
    }

    async getPath() {
        return new Promise((resolve, reject) => {
            this.getUARTList()
                .then(
                    res => {
                        res.forEach(dev => {
                            if (dev?.pnpId.includes("CAN_USB_ConverterBasic")) {
                                resolve(dev?.path);
                            }
                        })
                        reject(new Error(`Path not found. List devices: ${JSON.stringify(res)}`))
                    },
                    err => {
                        reject(err);
                    }
                )
                .catch(err => reject(err))
        })
    }

    async connect() {
        return new Promise((resolve, reject) => {
            this.getPath()
                .then(
                    path => {
                        this.portName = path;
                        this.sp = new SerialPort({ path: this.portName, baudRate: 115200, autoOpen: true }, (e) => {
                            if (e) {
                                reject(e);
                            } else {
                                this.isConnected = true;
                                this.emit('connected');
                            }
                        });
                        this.parser = this.sp.pipe(new ReadlineParser({ delimiter: '\r' }))
                        this.parser.on('data', (data) => { this.onData(data) });
                        resolve('Port connected');
                    },
                    err => {
                        throw (err);
                    }
                )
                .catch(err => {
                    reject(err);
                })
        })
    }

    async disconnect() {
        return new Promise((resolve, reject) => {
            if (!this.isConnected) reject(`Device is disconnected already`);
            if (this.isOpen) {
                this.close();
            }
            this.sp.close((e) => {
                if (e) {
                    reject(`Device is disconnected already`)
                } else {
                    this.isConnected = false;
                    this.emit('disconnected');
                    resolve('Port disconnected successfully')
                }
            });
        })
    }

    async setBaudRate(br) {
        return new Promise((resolve, reject) => {

            if (!this.isConnected) reject(`Can't open device. Port closed`);

            let cmd = this.baudRates.forEach(val => {
                if (val.br === br) {
                    this.baudRate = br;
                    return val.cmd;
                }
            })
            cmd = cmd || 'S4';

            this.writeCMD(`${cmd}\r`)
                .then(
                    () => {
                        resolve(`Command: ${cmd}\r send successfully`)
                    },
                    (e) => {
                        reject(e)
                    })
                .catch(e => {
                    reject(e);
                })
        })
    }
    async open(mode) {
        return new Promise((resolve, reject) => {

            if (!this.isConnected) reject(`Can't open device. Port closed`);

            mode = mode || 'O';
            let cmd = this.baudRates.forEach(val => {
                if (val.br === this.baudRate) return val.cmd;
            })
            cmd = cmd || 'S4';

            this.writeCMD(`${cmd}\r${mode}\r`)
                .then(
                    () => {
                        this.isOpen = true;
                        this.emit('open');
                        resolve(`Command: ${cmd}\r${mode}\r send successfully`)
                    },
                    (e) => {
                        reject(e)
                    })
                .catch(e => {
                    reject(e);
                })
        })
    }

    async listen() {
        await this.open('L');
    }

    async close() {
        return new Promise((resolve, reject) => {
            if (!this.isOpen) resolve(`Device is not opened.`)
            if (!this.isConnected) reject(`Port closed!`)
            this.write('C\r')
                .then(
                    () => {
                        this.isOpen = false;
                        this.emit('close');
                        resolve(`CAN closed`)
                    },
                    (e) => reject(e)
                )

        })

    }

    async writeCMD(str) {
        return new Promise((resolve, reject) => {
            if (str === undefined) reject('CMD is empty')
            if (!this.sendCMD === undefined) reject('Еhe previous command is executed')
            this.sendCMD = str;
            this.write(str)
                .then(
                    answer => {
                        resolve(answer)
                    },
                    error => {
                        reject(error)
                    }
                )
                .catch(
                    error => {
                        reject(error)
                    }
                )
        })
    }

    async write(str) {
        return new Promise((resolve, reject) => {
            this.sp.write(str, (e) => {
                if (e) {
                    reject(new Error(`Error in function ${arguments.callee.name}, can't write to port: ${e.message}`))
                }
            });
            this.sp.drain((e) => {
                if (e) {
                    reject(new Error(`Error in function ${arguments.callee.name}, can't drain to port: ${e.message}`))
                }
                resolve;
            });
        })
    }

    async writeStr(_str) {
        return new Promise((resolve, reject) => {
            let str = `${_str}\r`;
            this.sp.write(str, (e) => {
                if (e) reject(e);
            })
            this.sp.drain((e) => {
                if (e) reject(e)
            })
            resolve(`Sending: ${JSON.stringify(str)}`);
        })
    }

    onData(_data) {
        let data;
        if (this.sendCMD === undefined) {
            data = _data;
        } else {
            switch (this.sendCMD) {
                case 'V':
                    //hardware version.
                    this.HV = _data;    
                    break;
                case 'v':
                    //firmware version.
                    this.FV = _data;
                    break;
                
                case 'N':
                    //serial number.
                    this.SN = _data;
                    break;
                    
                default:
                    break;
            }
            data = `Send CMD: ${JSON.stringify(this.sendCMD)}, Answer: ${JSON.stringify(_data)}`;
            this.sendCMD = undefined;
        }
        this.emit('data', data);
    }

    checkBaudRate(br) {
        return this.baudRate.includes(br);
    }
}
