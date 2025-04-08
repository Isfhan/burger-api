import { v4 as uuidv4 } from 'uuid';
import { number } from 'zod';
export const generateRandomUID = (): string => {
    return uuidv4()
}
export const getTimestampInStr = (): string=>{
    function formatDate(value: number): string{
        return value < 10 ? `0${value}` : `${value}`
    }
    const currentDate = new Date(Date.now())
    return `${currentDate.getFullYear()}-${formatDate(currentDate.getMonth())}-${formatDate(currentDate.getDate())} ${formatDate(currentDate.getHours())}:${formatDate(currentDate.getMinutes())}:${formatDate(currentDate.getSeconds())}.${formatDate(currentDate.getMilliseconds())} `
}