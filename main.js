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

    async start(mode) {
        // mode = 'O' | 'L' | 'l'
        let _mode = mode || "O";
        if (!["O", "L", "l"].includes(mode)){
            throw new Error(`Can't Start device in unknown mode: ${mode}`)
        }
        try{
            await this.portInit();
            await this.portOpen();
            // перед открытием, получить версии HW, прошивки, серийный номер
            await this.getDeviceInfo();
            await this.canOpen(_mode); //default
            this.emit('canStart');
        }catch(e){
            throw e;
        }
    }

    async stop() {
        try{
            await this.canClose();
            await this.portClose();
            this.emit('canStop');
        }catch(e){
            throw(e);
        }
    }

    async getDeviceInfo(){
        if (this.isOpen && !this.isConnected) throw new Error(`Can't get info from device. Port is closed or device is started`)

        await this.writeStr('V');
        await this.writeStr('v');
        await this.writeStr('N');
        await this.writeStr('F');
    }

    async portInit() {
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
    }

    async portOpen() {
        // открыть порт
        return new Promise((resolve, reject) => {
            this.sp = new SerialPort({ path: this.portName, baudRate: 115200, autoOpen: true }, (e) => {
                if (e) {
                    reject(e);
                } else {
                    this.parser = this.sp.pipe(new ReadlineParser({ delimiter: '\r' }))
                    this.parser.on('data', (data) => { this.onData(data) });
                    this.isConnected = true;
                    this.emit('portOpen');
                    resolve('Port opened');
                }
            });
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

    async canOpen(type) {
        let _type = type || "O";
        let _speed = "S4";

        cmds.forEach(element => {
            if (element.br === this.baudRate) {
                _speed = element.cmd;
            }
        });
        try{
            await this.canSetBaudRate(_speed)
            await this.writeStr(_type)
            this.emit('canOpen');
        }catch (e){
            throw e;
        }
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

    async writeStr(_str) {
        return new Promise((resolve, reject) => {
            let str = `${_str}\r`;
            this.sp.write(str, (e) => {
                if (e) {
                    reject(e)
                }
//                     reject(new Error(`Error in function ${arguments.callee.name}, can't write to port: ${e.message}`))                
            })
            this.sp.drain((e) => {
                if (e) {
                    reject(e)
                }else{
                    resolve(`Sending: ${JSON.stringify(str)}`);
                }
            })
        })
    }

    /**
     * @brief 
     * 
     * @param {boolean} ext - указывает на расширенный формат (29bit) адреса вместо короткого (11bit) 
     * @param {string} adr  - строка адреса сообщения в 16-ом формате
     * @param {boolean} rtr - 
     * @param {number} len  - длина сообщения 
     * @param {Array} dat   - массив сообщения в 10-ом формате
     */
    async sendMessage(ext, adr, rtr, len, dat){
        if (!rtr && !(+len == +dat.length)) throw new Error(`The length of the DAT array does not match the parameter LEN. LEN: ${len}, DAT.LENGTH: ${dat.length}.`)

        function addDat(len, dat){
            let _str = "";
            for (let i = 0; i < len; i++){
                _str += dat[i].toString(16).padStart(2, "0");
            }
            return _str
        }
        let str = "";
        if (ext){
            str = adr.padStart(8, "0") + len;
            if (rtr){
                str = "R" + str; 
            }else{
                str = "T" + str + addDat(len, dat);
            }
        }else{
            str = adr.padStart(3, "0") + len
            if (rtr) {
                str = "r" + str;
            }else{
                str = "t" + str + addDat(len, dat);
            }
        }
        await this.writeStr(str);
    }

    /**
     * 
     * @param {string} m
     * @returns {object} .emmit 'canMessage'
     */
    parseMessage(m){
        let _set = {
            ext: false,
            adr: '',
            rtr: false,
            len: 0,
            dat: []
        }
        let char;
        char = m[0];
        switch (char){
            case 't':
                _set.adr = m.slice(1,4);
                _set.len = m[4];
                // 5 + l*2
                for (let i = 0; i < _set.len; i++){
                    _set.dat.push(m.slice(5+2*i, 7+2*i)) //TODO: add converter to number
                }
                break;
            case 'r':
                _set.adr = m.slice(1,4);
                _set.rtr = true;        
                break;
            case 'T':
                _set.adr = m.slice(1,9);
                _set.ext = true;
                _set.len = m[9];
                // 9 + l*2
                for (let i = 0; i < _set.len; i++){
                    _set.dat.push(m.slice(10+2*i, 12+2*i))
                }
                break;
            case 'R':
                _set.adr = m.slice(1,9);
                _set.ext = true;
                _set.rtr = true;        
                break;
            default:
                throw new Error(`Error parse input message. Wrong type message: ${JSON.stringify(char)}`);
                
                break
        }
        this.emit('canMessage', JSON.stringify(_set));
    }

    onData(_data) {
        /**
         * интерпретация данных полученных из порта 
         * проверяем первый символ
         *  - "t" - получено сообщение
         *  - "T"
         *  - "r"
         *  - "R"
         *  - "v" - версия прошивки
         *  - "V" - версия платы
         *  - "N" - серийный номер
         *  - "z" - сообщение отправлено
         */
        let d = _data;
        try{
            d.replace(/\r|\n/g, '');
        }catch (e){
            let err = e?.message || 'ERROR: Can\'t replace'
            this.emit('error', err)
        }

        if (0 === d.length) {
            // получено подтверждение како-то команды
            // 
            return;
        }else{
            switch (d[0]) {
                case 't':
                case 'T':
                case 'r':
                case 'R':
                    // получено сообщение
                    // выдать данные на парсинг
                    this.parseMessage(d);
                    this.emit('data', d);
                    break;
                case 'v':
                    // firmware version
                    //
                    this.FV = d.slice(1);
                    break;
                case 'V':
                    // hardware version
                    //
                    this.HV = d.slice(1);
                    break;
                case 'N':
                    // serial number
                    //
                    this.SN = d.slice(1);
                    let inf = {fv: this.FV, hv: this.HV, sn: this.SN};
                    this.emit('info', JSON.stringify(inf));
                    break;
                case 'z':
                    // message sending
                    this.emit('send', d);
                    break;
                default:
                    this.emit('error', `Unknown type message: ${d}`)
                    break;
            }
        }
    }

    checkBaudRate(br) {
        return this.baudRate.includes(br);
    }
}
