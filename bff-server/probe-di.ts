import 'reflect-metadata';
import { AsrGateway } from './src/asr/asr.gateway';
const m = Reflect.getMetadata('design:paramtypes', AsrGateway);
console.log('design:paramtypes =', m ? m.map((x: any) => x && x.name) : m);
