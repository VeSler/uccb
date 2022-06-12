/**
 * v0.1.23
 * 
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
    baudRate;
    mode;
    ld;

    sp;         // SerialPort 
    parser;     // serialport/parser-readline

    isConnected = false;
    isOpen = false;
    isPresentDevice = false;
    HV = "";
    SV = "";
    SN = "";
    status = "";

    preparedMessages = [];
    fSending = false;
    fClosing = false;

    baudRates = ['100k', '125k', '250k', '500k', '800k', '1M'];
    cmds = [
        { cmd: 'S3', br: '100k' },
        { cmd: 'S4', br: '125k' },
        { cmd: 'S5', br: '250k' },
        { cmd: 'S6', br: '500k' },
        { cmd: 'S7', br: '800k' },
        { cmd: 'S8', br: '1M' },
    ]

    ///** @type {TypeA|TypeB|...} */
    //let obj;

    /**
     * @constructor
     * @param {*} baudRate 
     */
    constructor(baudRate) {
        //baudRate: '' | '100k' | '125k' | '250k' | '500k' | '800k' | '1M'
        super();
        this.baudRate = baudRate || '125k';
        if (!this.checkBaudRate(baudRate)) {
            throw new Error(`Incorrect value baudRate: ${this.baudRate}`)
        };
    }


    /**
     * PUBLIC
     */

    /**
     * @brief Start device
     * @public
     * @param {*} mode = 'O' | 'L' | 'l'
     * @returns Promise
     */
    async start(mode) {
        return new Promise((resolve, reject) => {
            let _mode = mode ?? "O";
            if (!["O", "L", "l"].includes(_mode)){
                reject(new Error(`Can't Start device with unknown parameter. Mode: ${_mode}`))
            }
            try{
                await this.prepareConnection();
                /*
                await this.portOpen();
                await this.getDeviceInfo();
                await this.canOpen(_mode);
                */
                this.emit('canStart', 'CANBUS started successfully');
                resolve();
            }catch(e){
                reject(e);
            }    
        })
    }

    /**
     * @brief Stop device
     * @public
     * @returns Promise
     */
     async stop() {
        return new Promise((resolve, reject) => {
            try{
                /*
                await this.canClose();
                await this.portClose();
                */
                this.emit('canStop', 'CANBUS stopped successfully');
                resolve();
            }catch(e){
                reject(e);
            }
        })
    }


    /**
     * @brief 
     */

    async prepareConnection() {
         /*
        try{           
            let list = await this.getUARTList();
            for(let item of list){
                if (item?.pnpId.includes("CAN_USB_ConverterBasic")) {
                    this.portName = item?.path;
                    return;
                }
            }
            throw new Error(`Path not found. List devices: ${JSON.stringify(res)}`)
        }catch(e){
            throw e;
        }
        */
    }



    /**
     * PRIVATE
     */


    /**
     * @private ?
     * @brief Return list USB-devices in system
     */

     async getUARTList() {
        try {
            return await SerialPort.list();
        } catch (e){
            throw e;
        }
    }


    /**
     * @private
     * @param {*} br 
     * @returns TRUE or FALSE 
     */
    checkBaudRate(br) {
        return this.baudRate.includes(br);
    }
}
