/**
 * v0.2.10
 * 
 * 0.1.0 - новая структура интерфейса
 * 
 * 0.0.1 - 
 * реализовано:
 * находим порт, подключаемся, активируем адаптер  (на 125)
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
 *
 * MnnbbfiiiiiiiiImmmmmmmmF
 * 
 * M: Set acceptance filter mask.
 * nn: filter number 0-1B           // Specifies the filter which will be initialized
 *                                  // This parameter must be a number between Min_Data = 0 and Max_Data = 27
 * bb: bank number 0-1B             // Select the start slave bank filter
 *                                  // This parameter must be a number between Min_Data = 0 and Max_Data = 28
 * f: filter flags                  // bitMask
 * 1 Filter Activation              // Enable or disable the filter.
 * 2 Mode: Mask or Filter           // Specifies the filter mode to be initialized, 0 - MASK, 1 - LIST
 * 4 Scale: 2x16 bit or 1x32 bit    // Specifies the filter scale. 0 - 16bit, 1 - 32bit
 * 8 FIFO selection set as 0        // Specifies the FIFO (0 or 1U) which will be assigned to the filter
 * iiiiiiii: depends on Scale one 32 bit id or two 16 bit CAN frame id for filtering
 * I: id flags
 * 1 RTR1: filter for retransmission flag
 * 2 EX1: filter for extended flag
 * 4 RTR2: filter for retransmission flag (for 16 bit filtering)
 * 8 EX2: filter for extended flag
 * mmmmmmmm: If mode set to MASK, mask value, else as iiiiiiii
 * F: flags for mask same as I
 * 
 * Example:
 * M nn bb f iiiiiiii I mmmmmmmm F
 * M 00 00 7 00000001 0 00000001 0      (set id filter for ID=1 and ID=1)   Enable + Filter + 32bit
 * M 00 00 5 00000000 0 00000000 F      ignore all extended CAN packets     Enable + Mask + 32bit
 * Md                                   delete all filters
 * 
 * M 00 00 5 00000600 0 00000F00 0      two separate filters one for 0x600 (in bank 0 )
 * M 01 00 5 00000700 0 00000F00 0      and 2nd for 0x700 ( in bank 1)
 * 
 * M 00 00 5 00000600 0 00000F00 0      If only 0x600 - 0x6FF then
 * 
 */

const { SerialPort } = require('serialport');
const EventEmitter = require('node:events');
const { ReadlineParser } = require('@serialport/parser-readline');
const { resolve } = require('node:path');
 
module.exports = class Uccb extends EventEmitter {
 
    portName;   // название порту USB
    baudRate;
    mode;
 
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
 
     /**
     * @constructor
     * @param {*} baudRate = '' | '100k' | '125k' | '250k' | '500k' | '800k' | '1M'
     * @default '125k'
     */
    constructor(baudRate) {
        super();
        this.baudRate = baudRate || '125k';
        if (!this.checkBaudRate(baudRate)) {
            throw new Error(`Incorrect value baudRate: ${this.baudRate}`)
        };
    }
 
    /**
     * @method Start device
     * @public
     * @param {*} mode = 'O' | 'L' | 'l'
     * @returns Promise
     */
    start(mode) {
        return new Promise((resolve, reject) => {
            let _mode = mode || "O";
            if (!["O", "L", "l"].includes(mode)){
                reject(new Error(`Can't Start device in unknown mode: ${mode}`))
            }
            this.prepareConnection()
            .then(() => this.portOpen())
            .then(() => this.getDeviceInfo())
            .then(() => this.canOpen(_mode))
            .then(() => {
                    this.emit('canStart', 'CAN_BUS started successfully');
                    resolve();
            })
            .catch(e => {
                reject(e);
            })
        })
    }
    
    /**
     * @method Stop device
     * @public
     * @returns Promise
     */
    async stop() {
        return new Promise((resolve, reject) => {
            this.canClose()
            .then(() => this.portClose())
            .then(() => this.emit('canStop'))
            .catch(e => reject(e))
        })
    }
 
    async getDeviceInfo(){
        if (this.isOpen && !this.isConnected) throw new Error(`Can't get info from device. Port is closed or device is started`)
 
        await this.writeStr('V');
        await this.writeStr('v');
        await this.writeStr('N');
        await this.writeStr('F');
    }

    /**
     * @brief 
     */
    async prepareConnection() {
        try{           
            let list = await this.getUSBList();
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
        return new Promise((resolve, reject) => {
            this.sp = new SerialPort({ path: this.portName, baudRate: 115200, autoOpen: true }, (e) => {
                if (e) {
                    reject(e);
                } else {
                    this.parser = this.sp.pipe(new ReadlineParser({ delimiter: '\r' }))
                    this.parser.on('data', (data) => { this.onData(data) });
                    this.isConnected = true;
                    this.emit('portOpen', `Port ${this.portName} opened`);
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
 
    /**
     * 
     * @param {string} mode 
     */
    async canOpen(mode) {
        let _mode = mode || "O";
        let _speed = "S4";
 
        this.cmds.forEach(element => {
            if (element.br === this.baudRate) {
                _speed = element.cmd;
            }
        });
        try{
            this.fClosing = false;
            await this.canSetBaudRate(_speed)
            let s = await this.writeStr(_mode)
            this.emit('canOpen', `CanBus opened. Command: ${s}`);
        }catch (e){
            throw e;
        }
    }
 
    /**
     * 
     */
    async canClose() {
        try{
            this.fClosing = true;
            while (this.preparedMessages.length > 0) {
                // whiting ?
            }
            let s = await this.writeStr('C');
            this.emit('canClose', `CanBus closed. Command: ${s}`);
        }catch (e){
            throw e;
        }
    }
 
    async getUSBList() {
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
            })
            this.sp.drain(function(e) {
                if (e) {
                    reject(e)
                }
                resolve(`Sending string: ${JSON.stringify(str)}`);
            })
        })
    }
 
    /**
     * @brief создает сообщение для отправки и ставит в очередь
     * 
     * @param {boolean} ext - указывает на расширенный формат (29bit) адреса вместо короткого (11bit) 
     * @param {string} adr  - строка адреса сообщения в 16-ом формате
     * @param {boolean} rtr - 
     * @param {number} len  - длина сообщения 
     * @param {Array} dat   - массив сообщения в 10-ом формате
     */
    async newMessage(ext, adr, rtr, len, dat){
        return new Promise((resolve, reject) => {
            if (this.fClosing) reject(new Error(`Can't send new messages. Device in the process of shutting down.`))
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
            this.preparedMessages.push(str);
            if (!this.fSending) {
                this.fSending = true;
                this.sendMessage()
                .then(() => {
                    resolve (this.preparedMessages.length);
                })
                .catch((e) => {
                    throw e;
                })
            }else{
                resolve (this.preparedMessages.length);
            }
        })
    }
    
    async sendMessage(){
        // отправка сообщений из очереди
        // Private
        if (this.preparedMessages.length == 0){
            this.fSending = false;
        }else{
            try{
                await this.writeStr(this.preparedMessages[0]);
            }catch (e){
                console.err(e)
            }
        }
    }
    
    /**
     * 
     * @param {string} m
     * @returns {object} .emit 'canMessage'
     */
    parseMessage(m){
        let _set = {
            ext: false,
            adr: '',
            rtr: false,
            len: 0,
            dat: []
        }
        let offset = 0;
        switch (m[0]){
            case 'T':
                offset = 5
                _set.ext = true;
            case 't':
                _set.adr = parseInt(m.slice(1,4+offset), 16);
                _set.len = parseInt(m[4+offset], 10);
                // 5 + l*2
                // 9 + l*2
                for (let i = 0; i < _set.len; i++){
                    _set.dat.push(parseInt(m.slice(5+offset+2*i, 7+offset+2*i), 16));
                }
                break;
            case 'R':
                offset = 5;
                _set.ext = true;
            case 'r':
                _set.rtr = true;        
                _set.adr = m.slice(1,4+offset);
                _set.len = +m[4+offset];
                break;
            default:
                throw new Error(`Error parse input message. Wrong type message: ${JSON.stringify(m[0])}`);
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
         *  - "Z"
         *  - "F" - Read status/error flag of can controller
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
                case 'Z':
                    // message sending
                    this.emit('send', `Sending message: ${this.preparedMessages.shift()}`);
                    this.sendMessage();
                    break;
                case 'F':
                    this.emit('status', d);
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
 