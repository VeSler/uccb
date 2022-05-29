/**
 * 0.0.2 -
 * 
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
    autoOpen;   //
    baudRate;
    ld;

    sp;         // SerialPort 
    parser;     // serialport/parser-readline

    status = 'disconnected'; // disconnected, connected, open, listen 
    isConnected = false;
    isOpen = false;
    isPresentDevice = false;
    sendCMD;

    baudRates = ['100k', '125k', '250k', '500k', '800k', '1M'];
    cmds = [
        {cmd: 'S3', br: '100k'},
        {cmd: 'S4', br: '125k'},
        {cmd: 'S5', br: '250k'},
        {cmd: 'S6', br: '500k'},
        {cmd: 'S7', br: '800k'},
        {cmd: 'S8', br: '1M'},
    ]

    constructor(baudRate, autoOpen, mode) {
        //baudRate: '', '100k', '125k', '250k', '500k', '800k', '1M'
        super();
        this.baudRate = baudRate || '125k';
        this.autoOpen = autoOpen || false;
        this.mode = mode || 'Open';
        if (!this.checkBaudRate(baudRate)){
            throw new Error(`Incorrect value baudRate: ${this.baudRate}`)
        };
        this.getPath()
        .then(
            path => {
                this.portName = path;
                this.isPresentDevice = true;
            },
            err => {
                throw (err);
            }
        )
        if (this.autoOpen){}
    }

    async getUARTList(){
        return new Promise((resolve,reject) => {
            SerialPort.list()
            .then(res => resolve(res), err => reject(err))
            .catch(err => reject(err))
        })
    }

    async getPath(){
        return new Promise((resolve, reject) => {
            this.getUARTList()
            .then(
                res => {
                    res.forEach(dev => {
                        if(dev?.pnpId.includes("CAN_USB_ConverterBasic")) {
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

    onData(_data){
        let data;
        if(this.sendCMD === undefined){
            data = _data;
        }else{
            data = `Send CMD: ${JSON.stringify(this.sendCMD)},\r\nAnswer: ${JSON.stringify(_data)}`;
            this.sendCMD = undefined;
        }
        this.emit('data', data);
    }

    async connect(){
        return new Promise((resolve, reject) => {
            if (!this.isPresentDevice) reject(`Port not found`);
            this.sp = new SerialPort({ path: this.portName, baudRate: 115200, autoOpen: true }, (e) => {
                if(e) {
                    reject(e);
                }else{
                    this.isConnected = true;
                    this.emit('connected');
                }
            }); 
            this.parser = this.sp.pipe(new ReadlineParser({ delimiter: '\r' }))
            this.parser.on('data', (data) => {this.onData(data)});
            resolve('Port connected');
        })
    }

    async disconnect(){
        return new Promise((resolve, reject) => {
            if (!this.isConnected) reject(`Device is disconnected already`);
            if (this.isOpen) {
                //TODO: this.close();
            }
            this.sp.close((e) => {
                if (e) {
                    reject(`Device is disconnected already`)
                }else{
                    this.isConnected = false; 
                    this.emit('disconnected');
                    resolve('Port disconnected successfully')                  
                }
            });    
        })
    }

    async open(l){
        //TODO: обработка this.isConnected и this.isOpen

    
        return new Promise((resolve, reject) => {
    
            if (!this.isConnected) reject(`Can't open device. Port closed`);

            l = l || 'O';
            let cmd = this.baudRates.forEach(val => {
                if (val.br === this.baudRate) return val.cmd;
            })
            cmd = cmd || 'S4';
        
            this.writeCMD(`${cmd}\r${l}\r`)
            .then(
                () => {
                    this.isOpen = true;
                    this.emit('open');
                    resolve(`Command: ${cmd}\r${l}\r send successfully`)    
                },
                (e) => {
                    reject(e)
                })
            .catch(e => {
                reject(e);
            })                
        })
    }

    async listen(){
        await this.open('L');
    }

    async close(){
        //TODO: обработка this.isConnected и this.isOpen
        //TODO: try ... catch
        return new Promise((resolve, reject) => {
            if (!this.isOpen) reject(`Device is not opened.`)
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

    async writeCMD(str){
        return new Promise((resolve, reject) => {
            if (srt === undefined) reject('CMD is empty')
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

    async write(str){
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

    checkBaudRate(br){
        return this.baudRate.includes(br);
    }
}
