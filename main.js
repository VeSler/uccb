/**
 * 0.0.1 - 
 * реализовано:
 * находим порт, подключаемся, активируем адаптер  (на 125)
 * 
 * connect()
 * disconnect();
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
const { resolve } = require('node:path');

module.exports = class Uccb extends EventEmitter {

    portName;   // назва порту UART
    autoOpen;   //
    sp;         // SerialPort 
    status = 'disconnected'; // disconnected, connected, open, listen 
    isConnected = false;
    isOpen = false;
    baudRate;
    ld;

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

    run(){
        this.findDevice((err,path) => {
            if (err){

            }else{
                this.portName = path;
                //TODO: connect нужно переделать на использование callback
                return this.connect();            
            }
        })
/*        {
            this.status = 'connected';
            this.isConnected = true;
            this.emit('connected');
            this.On();
        }*/
    }

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

    async getUARTListAsync(){
        return new Promise((resolve,reject) => {
            SerialPort.list()
            .then(res => resolve(res), err => reject(err))
            .catch(err => reject(err))
        })
    }

    async getPath(){
        return new Promise((resolve, reject) => {
            this.getUARTListAsync()
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
                        resolve();
                    }
                });        
            })
        })
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

    async write(str){
        this.sp.write(str, (e) => {
            if (e) {
                throw new Error(`Error in function ${arguments.callee.name}, can't write to port: ${e.message}`);
            }
        });
        this.sp.drain(() => {
            resolve;
        });
    }

    //TODO: как-то выбросить данные наружу ...
    On(){
        this.sp.on('open', this.onOpen.bind(this));

        this.sp.on('data', this.onData.bind(this));

        this.sp.on('error', this.onError.bind(this))
    } 

    onOpen(){

    };

    onData(data){
        
    };

    onError(){

    };

    checkBaudRate(br){
        return this.baudRate.includes(br);
    }
}
