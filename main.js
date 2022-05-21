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

module.exports = class Uccb {

    portName;   // назва порту UART
    sp;         // 
    status = 'disconnected'; // disconnected, connected, open, listen 
    isConnected = false;
    isOpen = false;
    baudRate;

    baudRates = ['100k', '125k', '250k', '500k', '800k', '1M'];
    cmds = [
        {cmd: 'S3', br: '100k'},
        {cmd: 'S4', br: '125k'},
        {cmd: 'S5', br: '250k'},
        {cmd: 'S6', br: '500k'},
        {cmd: 'S7', br: '800k'},
        {cmd: 'S8', br: '1M'},
    ]

    constructor(baudRate) {
        //baudRate: '', '100k', '125k', '250k', '500k', '800k', '1M'
        
        this.baudRate = baudRate || '125k';
        if (!this.checkBaudRate(baudRate)){
            throw new Error(`Incorrect value baudRate: ${this.baudRate}`)
        };
        this.portName = (this.findDevice())?.path;
        this.connect();

    }

    checkBaudRate(br){
        return this.baudRate.includes(br);
    }

    listDevices() {
        return new Promise(function(resolve, reject){
            SerialPort.list()
            .then(
                res => {
                    resolve(res)
                },
                err => {
                    reject(err)
                }
            )
            .catch( err => {
                reject(err)
            });
        })

    }

    findDevice() {
        this.listDevices()
        .then(
            res => {
                res.forEach(dev => {
                    if(dev?.pnpId.includes("CAN_USB_ConverterBasic")) {
                        return dev;
                    }
                })
                return;
            },
            err => {
                throw new Error(`Can't find UCCS devices in this system`)
            }
        )
    }

    async connect(){
        if (this.isConnected || this.isOpen) throw new Error(`Device already connected or open.`)
        if (!this.status === 'disconnected') throw new Error(`Device already connected or open.`)

        if(!this.portName) throw new Error('Не найденно устройство!') ;

        this.sp = new SerialPort({ path: this.portName, baudRate: 115200, autoOpen: true }, (e) => {
            if(e) {
                 throw new Error(e.message);
            }else{
                this.status = 'connected';
                this.isConnected = true;
                this.On();
            }
        });        
    }

    async disconnect(){
        //TODO: обработка this.isConnected и this.isOpen
        if (!this.status === 'connected') throw new Error(`Device is not in connected mode: ${this.status}`);
        try {
            this.sp.close();
            this.status = 'disconnected';
            this.isConnected = false;            
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
}
