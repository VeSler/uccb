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
        if (this.autoOpen){}
    }

/*
    getUARTList(callback){
        let callback_ = (typeof(callback) == 'function' ? callback : null);
        SerialPort.list()
        .then(res =>{
            this.ld = res
            callback_(null, res);
        })
        .catch(err => {
            callback_(err)
        })
    }
*/
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
            .then(res => {
                res.forEach(dev => {
                    if(dev?.pnpId.includes("CAN_USB_ConverterBasic")) {
                        resolve(dev?.path);
                    }
                    reject(new Error('Path not found'))
                }),
                err => {
                    reject(err);
                }
            })
            .catch(err => reject(err))
        })
    }

    async connect(){
        return new Promise((resolve, reject) => {
            if (this.isConnected || this.isOpen) reject(new Error(`Device already connected or open. isConnected: ${this.isConnected}, isOpen: ${this.isOpen}`));
            if (!this.status === 'disconnected') reject(new Error(`Device already connected or open. Status: ${this.status}`));

            this.getPath()
            .then(path => {
                this.portName = path;

                if(!this.portName) reject(new Error(`Не найдено устройство! portName: ${JSON.stringify(this.portName)}`));

                this.sp = new SerialPort({ path: this.portName, baudRate: 115200, autoOpen: true }, (e) => {
                    if(e) {
                        reject(e);
                    }else{
                        this.status = 'connected';
                        this.isConnected = true;
                        this.emit('connected');
                    }
                }); 
                this.parser = this.sp.pipe(new ReadlineParser({ delimiter: '\r' }))
                this.parser.on('data', (data) => {this.onData(data)});
                resolve();
            })
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

    async disconnect(){
        //TODO: обработка this.isConnected и this.isOpen
        if (!this.status === 'connected') throw new Error(`Device is not in connected mode: ${this.status}`);
        try {
            this.sp.close();
            this.status = 'disconnected';
            this.isConnected = false; 
            this.emit('disconnected');           
        } catch (e) {
            throw new Error(e.message);
        }
    }

    async open(l){
        //TODO: обработка this.isConnected и this.isOpen
        //TODO: try ... catch
        
        if (!this.status === 'connected') throw new Error(`Can't open device. Status: ${this.status}`);

        l = l || 'O';
        let cmd = this.baudRates.forEach(val => {
            if (val.br === this.baudRate) return val.cmd;
        })
        cmd = cmd || 'S4';
        await this.write(`${cmd}\r${l}\r`);
        this.status = 'open';
        this.isOpen = true;
        this.emit('open');
    }

    async listen(){
        await this.open('L');
    }

    async close(){
        //TODO: обработка this.isConnected и this.isOpen
        //TODO: try ... catch
        if (!this.status === 'open') throw new Error(`Device is not opened. `)
        await this.write('C\r');
        this.isOpen = false;
        this.emit('close');
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
