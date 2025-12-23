import axios from 'axios'

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true
})

// TODO: add auth interceptors if needed


