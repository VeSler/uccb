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

    async start(_mode) {
        // mode = 'O' | 'L' | 'l'
        let mode = _mode || 'O';
        try{
            await this.portInit();
            await this.portOpen();
            // перед открытием, получить версии HW, прошивки, серийный номер
            await this.getDeviceInfo();
            if ('O' === mode){
                await this.canOpen(); //default
            }else if ('L' === mode){
                await this.canListen();
            }else if ('l' === mode){
                await this.canLoopBack();
            }else{
                throw new Error(`Can't Start device in unknown mode: ${mode}`)
            }
            this.emit('canStart');
        }catch(e){
            throw e;
        }
    }

    async getDeviceInfo(){
        if (this.isOpen && !this.isConnected) throw new Error(`Can't get info from device. Port is closed or device is started`)

        await this.writeStr('V');
        await this.writeStr('v');
        await this.writeStr('N');
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
                    this.isConnected = true;
                    this.parser = this.sp.pipe(new ReadlineParser({ delimiter: '\r' }))
                    this.parser.on('data', (data) => { this.onData(data) });
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

            this.writeStr(cmd)
                .then(
                    () => {
                        resolve(`Command: ${cmd} send successfully`)
                    },
                    (e) => {
                        reject(e)
                    })
                .catch(e => {
                    reject(e);
                })
        })
    }

    async writeStr(_str) {
        return new Promise((resolve, reject) => {
            let str = `${_str}\r`;
            this.sp.write(str, (e) => {
                if (e) reject(e);
//                     reject(new Error(`Error in function ${arguments.callee.name}, can't write to port: ${e.message}`))                
            })
            this.sp.drain((e) => {
                if (e) reject(e)
            })
            resolve(`Sending: ${JSON.stringify(str)}`);
        })
    }

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
                _set.len = m[4];
                // 5 + l*2
                for (let i = 0; i < _set.len; i++){
                    _set.dat.push(m.slice(5+2*i, 7+2*i))
                }
            case 'r':
                _set.adr = m.slice(1,4);
                _set.rtr = true;        
                break;
            case 'T':
                _set.ext = true;
                _set.len = m[9];
                // 9 + l*2
                for (let i = 0; i < _set.len; i++){
                    _set.dat.push(m.slice(10+2*i, 12+2*i))
                }
            case 'R':
                _set.adr = m.slice(1,9);
                _set.rtr = true;        
                break;
            default:
                throw new Error(`Error parse input message. Wrong type message: ${JSON.stringify(char)}`)
                
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
