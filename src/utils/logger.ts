import {createLogger, format, transports, Logger} from "winston"
const {combine, simple, timestamp, colorize} = format

const logger = createLogger({
    level: 'info',
    format: combine(
        colorize(),
        timestamp(),
        simple()
    ),
    defaultMeta: { service: 'burger-api' },
    transports: [
        new transports.Console({
         
        })
    ]
})

export const CreateChildLogger = (metadata: Object): Logger =>{
    return logger.child(metadata)
}
